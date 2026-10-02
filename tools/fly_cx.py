#!/usr/bin/env python3
"""
fly_cx.py — ring-attractor compass with JEV ternary cue gating.
Build 4.1 of docs/FRUITFLY-JEV-MOTH.md; pre-registered in
docs/pre-registration-fly-v0.md (SEALED BEFORE this run, R1).

Fly mapping:
  E-PG bump  -> belief (theta, amplitude A)
  P-EN shift -> per-tick angular velocity integration
  JEV gate   -> per-cue ternary evidence evaluation
    Commit (psi=+1): conf >= TAU_MOTION and d <= 30deg -> re-anchor, A grows
    Reject (psi=-1): conf >= TAU_MOTION and d >  30deg -> A *= REJECT_SHRINK,
                     theta UNCHANGED (circKF belief-shortening)
    Abstain(psi= 0): conf <  TAU_MOTION -> dark-hold, nothing

Receipt: tools/fly_cx_receipt.json (seed, psi log, fnv1a-64 chained trajectory).
"""
import json, math, os

SEED = 20261001
BINS = 16
DT = 0.02
TAU_MOTION = 0.35          # pinned from tools/jev_gate.py
REJECT_SHRINK = 0.7        # circKF: conflicting cue shortens belief vector
COMMIT_BLEND = 0.4         # fraction of angular error closed on Commit
COMMIT_GAIN = 0.15         # amplitude growth on agreeing Commit (cap 1.0)
CONFLICT_DEG = 30.0        # angular distance cutoff: Commit vs Reject
A0 = 0.5                   # init amplitude = neutral uncertainty (unanchored compass)
# Model v2 (FAIL-first: v0/v1 receipted 2026-10-01, T2 RED — cold bump at theta=0
# rejected a 90deg landmark 21/21 and the hard 30deg cutoff made 90deg gaps
# unbridgeable). v2 rule — CERTAINTY-GATED CAPTURE (circKF-flavored):
#   err = circular error cue->theta; d = |err|
#   d <= CONFLICT_DEG            -> Commit: theta += BLEND*err; A += COMMIT_GAIN (cap 1)
#   d >  CONFLICT_DEG (conflict) -> Reject: A *= REJECT_SHRINK;
#                                   theta += BLEND*(1-A)*err   (certainty-gated:
#                                   a CONFIDENT compass is unmoved by distant
#                                   claims; an UNCERTAIN one can be captured)
# Sealed TESTS unchanged (docs/pre-registration-fly-v0.md).
ETA = 1e-9

def fnv1a64(data: str, h: int = 0xcbf29ce484222325) -> int:
    for b in data.encode():
        h ^= b
        h = (h * 0x100000001b3) & 0xFFFFFFFFFFFFFFFF
    return h

def ang_dist(a, b):
    d = abs((a - b + 180.0) % 360.0 - 180.0)
    return d

class FlyCX:
    def __init__(self, seed=SEED):
        self.theta = 0.0
        self.amp = A0
        self.model = "flycx-v2-certainty-gated"
        self.t = 0
        self.chain = 0xcbf29ce484222325   # fnv1a-64 chained trajectory
        self.psi_log = []

    def tick(self, omega=0.0):
        self.theta = (self.theta + omega * DT) % 360.0
        self.t += 1
        self.chain = fnv1a64(f"t{self.t}:{self.theta:.6f}:{self.amp:.6f}", self.chain)

    def cue(self, angle, conf, force_commit=False):
        d = ang_dist(angle, self.theta)
        if conf < TAU_MOTION:
            psi = 0
        elif d <= CONFLICT_DEG or force_commit:
            psi = 1
            err = ((angle - self.theta + 180.0) % 360.0) - 180.0
            self.theta = (self.theta + COMMIT_BLEND * err) % 360.0
            self.amp = min(1.0, self.amp + COMMIT_GAIN)
        else:
            psi = -1
            err = ((angle - self.theta + 180.0) % 360.0) - 180.0
            self.theta = (self.theta + COMMIT_BLEND * (1.0 - self.amp) * err) % 360.0
            self.amp *= REJECT_SHRINK
        self.psi_log.append({"t": self.t, "cue_angle": angle, "conf": conf,
                             "d_pre": round(d, 3), "psi": psi,
                             "theta_post": round(self.theta, 3),
                             "amp_post": round(self.amp, 4)})
        self.chain = fnv1a64(f"c{self.t}:{angle}:{conf}:{psi}", self.chain)
        return psi

def run():
    receipt = {"seed": SEED, "bins": BINS, "dt": DT, "tau_motion": TAU_MOTION,
               "reject_shrink": REJECT_SHRINK, "conflict_deg": CONFLICT_DEG,
               "commit_blend": COMMIT_BLEND, "commit_gain": COMMIT_GAIN, "a0": A0,
               "model": "flycx-v2-certainty-gated",
               "model_history": [
                 {"v": "v0/v1", "result": "T2 RED: cold bump rejected 90deg landmark "
                  "21/21; hard 30deg cutoff unbridgeable from 90deg gap",
                  "receipt_note": "FAIL-first preserved here"},
                 {"v": "v2", "change": "certainty-gated capture: conflict pull scaled "
                  "by (1-A); A0=0.5 neutral; COMMIT_GAIN 0.10->0.15 (model "
                  "constants, sealed TESTS untouched)"}],
               "tests": {}, "null_control": {}, "verdict": None}

    # ---- T1: zero input, 500 ticks — drift <= 5 deg/s
    f1 = FlyCX(); start = f1.theta
    for _ in range(500): f1.tick()
    drift = ang_dist(f1.theta, start)
    rate = drift / (500 * DT)
    receipt["tests"]["T1_zero_drift"] = {
        "deg_total": round(drift, 4), "deg_per_s": round(rate, 4),
        "pass": rate <= 5.0}

    # ---- T2: consistent cues (90 deg, conf 0.8) every 10 ticks x20
    f2 = FlyCX()
    for i in range(20):
        for _ in range(10): f2.tick()
        f2.cue(90.0, 0.8)
    err2 = ang_dist(f2.theta, 90.0)
    receipt["tests"]["T2_consistent_anchor"] = {
        "final_theta": round(f2.theta, 3), "err_deg": round(err2, 3),
        "pass": err2 <= 10.0}

    # ---- T3: one conflicting cue (270 deg, conf 0.8)
    amp_before = f2.amp; theta_before = f2.theta
    f2.cue(270.0, 0.8)
    amp_drop = (amp_before - f2.amp) / amp_before
    disp = ang_dist(f2.theta, theta_before)
    receipt["tests"]["T3_conflict_reject"] = {
        "amp_drop_frac": round(amp_drop, 4), "theta_disp_deg": round(disp, 3),
        "pass": amp_drop >= 0.30 and disp <= 15.0}

    # ---- T4: 500 cueless ticks after anchoring — drift <= 10 deg
    theta_t4 = f2.theta
    for _ in range(500): f2.tick()
    drift4 = ang_dist(f2.theta, theta_t4)
    receipt["tests"]["T4_dark_hold"] = {
        "deg_total": round(drift4, 3), "pass": drift4 <= 10.0}

    # ---- Null control: psi forced +1 (naive always-re-anchor), same stream
    fn = FlyCX()
    for i in range(20):
        for _ in range(10): fn.tick()
        fn.cue(90.0, 0.8, force_commit=True)
    theta_null_before = fn.theta
    fn.cue(270.0, 0.8, force_commit=True)
    null_disp = ang_dist(fn.theta, theta_null_before)
    receipt["null_control"] = {
        "policy": "psi forced +1 on every cue",
        "conflict_displacement_deg": round(null_disp, 3),
        "expected": "> 60 deg (proves Reject branch does the work)",
        "pass": null_disp > 60.0}

    f2.chain = fnv1a64("END", f2.chain)
    receipt["trajectory_hash_fnv1a64"] = format(f2.chain, "016x")
    receipt["n_psi"] = len(f2.psi_log)
    receipt["psi_counts"] = {
        "commit": sum(1 for p in f2.psi_log if p["psi"] == 1),
        "reject": sum(1 for p in f2.psi_log if p["psi"] == -1),
        "abstain": sum(1 for p in f2.psi_log if p["psi"] == 0)}
    receipt["psi_log_head"] = f2.psi_log[:3]
    allpass = all(t["pass"] for t in receipt["tests"].values()) and receipt["null_control"]["pass"]
    receipt["verdict"] = "PASS" if allpass else "FAIL"

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fly_cx_receipt.json")
    with open(out, "w") as fh: json.dump(receipt, fh, indent=2)
    print(json.dumps(receipt["tests"], indent=2))
    print("null:", json.dumps(receipt["null_control"]))
    print("trajectory_hash", receipt["trajectory_hash_fnv1a64"],
          "| psi", receipt["psi_counts"], "| verdict", receipt["verdict"])
    return 0 if allpass else 1

if __name__ == "__main__":
    raise SystemExit(run())
