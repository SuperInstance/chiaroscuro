/*
 * jev_gate_v2.js — JEV ternary gate with HOLD/CAST abstention split.
 * Build 4.3 of docs/FRUITFLY-JEV-MOTH.md; pre-registered in
 * docs/pre-registration-fly-v0.md (SEALED BEFORE measured runs, R1).
 *
 * Fly grounding: odor-OFF casting (van Breugel & Dickinson 2014) — evidence
 * ABSENCE after a rejection (or under low confidence) triggers STRUCTURED
 * EXPLORATION, not freezing. Abstain is bimodal:
 *   hold — keep prior, no dispatch (darkness straight flight)
 *   cast — widen the candidate set, bounded (crosswind search)
 *
 * Confidence register C (belief amplitude analog, fly_cx.py A):
 *   C += 0.10 on Value, C -= 0.15 on Abstain-reject, else C decays x0.98
 *   toward 0.5 baseline. CAST iff psi=0 AND (lastPsi===-1 OR C < 0.35).
 *   castStreak cap 3 -> forced hold (anti-thrash pin).
 *
 * Standalone module; zero deps; mirrors tools/jev_gate.py thresholds.
 */
(function (global) {
  'use strict';

  var TAU_MOTION_DEFAULT = 0.35;
  var TAU_STATIC_DEFAULT = 0.05;
  var C_INIT = 0.5, C_COMMIT = 0.10, C_REJECT = 0.15, C_DECAY = 0.98;
  var CAST_FLOOR = 0.35, CAST_STREAK_CAP = 3;

  function JevGateV2(numCells, opts) {
    opts = opts || {};
    this.numCells = numCells | 0;
    this.tauMotion = (opts.tauMotion !== undefined) ? opts.tauMotion : TAU_MOTION_DEFAULT;
    this.tauStatic = (opts.tauStatic !== undefined) ? opts.tauStatic : TAU_STATIC_DEFAULT;
    this.cols = (opts.cols !== undefined) ? opts.cols : 120;
    this._cls = new Int8Array(this.numCells);
    this._seen = new Uint8Array(this.numCells);
    this._prev = new Float32Array(this.numCells);
    this.C = new Float32Array(this.numCells); C_INIT && this.C.fill(C_INIT);
    this._lastCls = new Int8Array(this.numCells);
    this._castStreak = new Uint8Array(this.numCells);
    this.dispatched = 0; this.skipped = 0; this.formula = 0;
    this.casts = 0; this.holds = 0;
  }

  /**
   * update(cellIndex, v) — v in 0..1 (normalized luma).
   * Returns { cls: 1|0|-1, mode: 'value'|'formula'|'cast'|'hold' }.
   */
  JevGateV2.prototype.update = function (ci, v) {
    var cls;
    if (!this._seen[ci]) { cls = 1; this._seen[ci] = 1; }
    else {
      var d = v - this._prev[ci]; if (d < 0) d = -d;
      if (d > this.tauMotion) cls = 1;
      else if (d >= this.tauStatic) cls = 0;
      else cls = -1;
    }
    this._prev[ci] = v;
    this._cls[ci] = cls;

    // confidence register
    var c = this.C[ci];
    if (cls === 1) c += C_COMMIT;
    else if (cls === -1) c -= C_REJECT;
    else c = C_DECAY * c + (1 - C_DECAY) * C_INIT;
    if (c < 0) c = 0; if (c > 1) c = 1;
    this.C[ci] = c;

    // abstention mode split
    var mode;
    if (cls === 1) { mode = 'value'; this._castStreak[ci] = 0; this.dispatched++; }
    else if (cls === 0) { mode = 'formula'; this._castStreak[ci] = 0; this.formula++; }
    else {
      var wantCast = (this._lastCls[ci] === -1 && cls === -1) || c < CAST_FLOOR;
      if (wantCast && this._castStreak[ci] < CAST_STREAK_CAP) {
        mode = 'cast'; this._castStreak[ci]++; this.casts++;
      } else { mode = 'hold'; this.holds++; }
    }
    this._lastCls[ci] = cls;
    return { cls: cls, mode: mode, confidence: +c.toFixed(4) };
  };

  JevGateV2.prototype.reset = function () {
    this._seen.fill(0); this._lastCls.fill(0); this._castStreak.fill(0);
    this.C.fill(C_INIT);
    this.dispatched = 0; this.skipped = 0; this.formula = 0;
    this.casts = 0; this.holds = 0;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = { JevGateV2: JevGateV2 };
  else global.JevGateV2 = JevGateV2;
})(typeof window !== 'undefined' ? window : globalThis);
