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
 * HOLD/CAST (JEV v2, docs/HOLDCAST-pre-registration.md — sealed pre-run):
 *   Abstain frames are classified by abstainMode(ci):
 *     HOLD — default: keep prior, no dispatch (darkness straight-flight).
 *     CAST — (a) the cell's last nonzero ψ was −1 (rejection just happened),
 *            or (b) belief amplitude (EMA of |evidence|, decay 0.9/frame)
 *            < beliefFloor (default 0.10). CAST is capped at 1 per cell per
 *            castWindow frames (default 16); every CAST counted in this.casts.
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
    // JEV v2 belief register (pre-registered: decay 0.9, floor 0.10, window 16)
    this.beliefDecay = (opts.beliefDecay !== undefined) ? opts.beliefDecay : 0.9;
    this.beliefFloor = (opts.beliefFloor !== undefined) ? opts.beliefFloor : 0.10;
    this.castWindow = (opts.castWindow !== undefined) ? opts.castWindow : 16;
    this._belief = new Float32Array(this.numCells); // EMA of |evidence| per cell
    this._lastPsi = new Int8Array(this.numCells);   // last nonzero ψ (1 / -1)
    this._sinceCast = new Uint16Array(this.numCells);
    this._sinceCast.fill(this.castWindow); // first cast is immediately eligible
    this.casts = 0;   // CAST-classified abstain frames (receipted)
    this.holds = 0;   // HOLD-classified abstain frames
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
    this._belief.fill(0);
    this._lastPsi.fill(0);
    this._sinceCast.fill(0);
    this.dispatched = 0; this.skipped = 0; this.formula = 0;
    this.casts = 0; this.holds = 0;
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
      // belief register update (JEV v2): EMA of |evidence| on seen frames;
      // first sight initializes the prior and does not count as evidence.
      // last nonzero ψ tracked for CAST eligibility (1 here; −1 via markRejected())
      this._belief[ci] = this._belief[ci] * this.beliefDecay + d * (1 - this.beliefDecay);
      if (cls === 1) this._lastPsi[ci] = 1;
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
   * abstainMode(ci) — JEV v2: classify the cell's CURRENT Abstain frame.
   *   CAST iff (last nonzero ψ was −1 OR belief < floor) AND this cell's cast
   *   cooldown (castWindow abstain-frames) has elapsed — i.e. max ONE cast per
   *   cell per castWindow abstain frames. Per-cell clock: ticks on this cell's
   *   own abstain frames. Counters ride this.casts / this.holds (receipted).
   */
  JevGate.prototype.abstainMode = function (ci) {
    var cast = false;
    if ((this._lastPsi[ci] === -1 || this._belief[ci] < this.beliefFloor) &&
        this._sinceCast[ci] >= this.castWindow) {
      cast = true;
      this._sinceCast[ci] = 0;
    } else if (this._sinceCast[ci] < this.castWindow) {
      this._sinceCast[ci]++;
    }
    if (cast) { this.casts++; return 1; } // 1 = CAST
    this.holds++; return 0;              // 0 = HOLD
  };

  /** markRejected(ci) — host calls when a cue at this cell was REJECTED (ψ=−1
   *  on evidence grounds outside luma, e.g. conflicting landmark): sets the
   *  last-nonzero-ψ register so the next abstain frame is CAST-eligible. */
  JevGate.prototype.markRejected = function (ci) {
    this._lastPsi[ci] = -1;
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
