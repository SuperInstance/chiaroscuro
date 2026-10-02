/*
 * jev_gate.js — ternary Jev gate for per-cell dispatch skipping.
 * Lane A. Ported from tools/jev_gate.py (seed=20260930 reference).
 *
 * psi(v) ->  1  Value   (v >  TAU_MOTION) — full recompute
 *            0  Formula (TAU_STATIC <= v <= TAU_MOTION) — cheap formula update
 *           -1  Abstain (v <  TAU_STATIC) — skip, reuse previous glyph
 *
 * NEIGHBORHOOD COHERENCE (coherenceRadius > 0):
 *   A cell whose 4-neighbor (von Neumann, same radius) produced Value on
 *   this frame is FORCED to recheck: an Abstain/Formula cell upgrades to
 *   Value. Rationale: motion propagates across cell boundaries; a quiet
 *   neighbor of a loud cell is suspect. Upgrade rule is one-way per frame
 *   (Abstain→Value, Formula→Value); never downgrades.
 *
 * All state is plain typed arrays; zero allocation in update().
 */
(function (global) {
  'use strict';

  var TAU_MOTION_DEFAULT = 0.35;
  var TAU_STATIC_DEFAULT = 0.05;

  function JevGate(numCells, opts) {
    opts = opts || {};
    this.numCells = numCells | 0;
    this.tauMotion = (opts.tauMotion !== undefined) ? opts.tauMotion : TAU_MOTION_DEFAULT;
    this.tauStatic = (opts.tauStatic !== undefined) ? opts.tauStatic : TAU_STATIC_DEFAULT;
    this.coherenceRadius = (opts.coherenceRadius !== undefined) ? opts.coherenceRadius : 0;
    this.cols = (opts.cols !== undefined) ? opts.cols : 120;
    // per-cell class: 1 Value, 0 Formula, -1 Abstain
    this._cls = new Int8Array(this.numCells);
    // 1 after the cell has been seen once (frame 0 = all Value)
    this._seen = new Uint8Array(this.numCells);
    // previous-frame mean luma per cell (0..1 scale, luma24/24)
    this._prev = new Float32Array(this.numCells);
    this.dispatched = 0;   // cells that will hit GPU this frame
    this.skipped = 0;      // Abstain cells reused
    this.formula = 0;      // Formula-class cells (cheap path, still counted dispatched)
  }

  JevGate.prototype.reset = function () {
    this._seen.fill(0);
    this.dispatched = 0; this.skipped = 0; this.formula = 0;
  };

  /**
   * update(cellIndex, luma24) — luma24 = sum of 24 subpixel lumas (0..24).
   * Call for EVERY cell each frame, in row-major order.
   * Returns 1 | 0 | -1.
   */
  JevGate.prototype.update = function (ci, luma24) {
    var v = luma24 / 24.0;
    var cls;
    if (!this._seen[ci]) {
      cls = 1; // first sight of this cell: full compute
      this._seen[ci] = 1;
    } else {
      var d = v - this._prev[ci];
      if (d < 0) d = -d;
      if (d > this.tauMotion) cls = 1;
      else if (d >= this.tauStatic) cls = 0;
      else cls = -1;
    }
    this._prev[ci] = v;
    this._cls[ci] = cls;
    return cls;
  };

  /**
   * applyCoherence() — AFTER the full-frame update() pass, if
   * coherenceRadius > 0: any Abstain/Formula cell with a Value cell within
   * von-Neumann distance coherenceRadius upgrades to Value.
   */
  JevGate.prototype.applyCoherence = function () {
    if (this.coherenceRadius <= 0) return;
    var cols = this.cols, rows = (this.numCells / cols) | 0;
    var r = this.coherenceRadius;
    var cls = this._cls;
    var upgraded = new Int8Array(this.numCells); // 0 = keep, 1 = upgrade
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var ci = y * cols + x;
        if (cls[ci] === 1) continue;
        // scan neighborhood for a Value cell
        var found = false;
        for (var dy = -r; dy <= r && !found; dy++) {
          for (var dx = -r; dx <= r && !found; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (Math.abs(dx) + Math.abs(dy) > r) continue; // von Neumann (Manhattan)
            var nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            if (cls[ny * cols + nx] === 1) found = true;
          }
        }
        if (found) upgraded[ci] = 1;
      }
    }
    for (var i = 0; i < this.numCells; i++) {
      if (upgraded[i] === 1) cls[i] = 1;
    }
  };

  /** shouldSkip(ci) — true if the cell's last class is Abstain. */
  JevGate.prototype.shouldSkip = function (ci) {
    return this._cls[ci] === -1;
  };

  /** classOf(ci) — raw class. */
  JevGate.prototype.classOf = function (ci) {
    return this._cls[ci];
  };

  /**
   * tally() — recompute dispatched/skipped/formula counters. Call after
   * update()+applyCoherence() when you want authoritative counts.
   */
  JevGate.prototype.tally = function () {
    var d = 0, s = 0, f = 0;
    for (var i = 0; i < this.numCells; i++) {
      var c = this._cls[i];
      if (c === 1) d++;
      else if (c === 0) { f++; d++; } // formula cells still dispatched (cheap path)
      else s++;
    }
    this.dispatched = d; this.skipped = s; this.formula = f;
    return { dispatched: d, skipped: s, formula: f };
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { JevGate: JevGate };
  } else {
    global.JevGate = JevGate;
  }
})(typeof self !== 'undefined' ? self : this);
