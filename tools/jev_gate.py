#!/usr/bin/env python3
"""
Jev-gated frame diffing — CPU reference for the JS port (RD-PLAN Round 3).

Simulates two consecutive frames, classifies each cell with the ternary
gate psi(v), and measures the fraction of cells that would be skipped by
the GPU dispatch (Abstain class). Reports expected FPS gain.

psi(v): 1 = Value (dispatch), 0 = Formula (recheck, cheap), -1 = Abstain (skip)
"""
import json
import random
import time

SYSTEM_SEED = 20260930
TAU_MOTION = 0.35
TAU_STATIC = 0.05
FRAMES = 60
GRIDS = [(80, 45), (100, 50), (120, 60)]


def psi(v):
    if v > TAU_MOTION:
        return 1
    if v >= TAU_STATIC:
        return 0
    return -1


def simulate(frames, cells, motion_ratio):
    rng = random.Random(SYSTEM_SEED)
    prev = [rng.random() for _ in range(cells)]
    skipped_total = 0
    for f in range(frames):
        n_moving = int(cells * motion_ratio)
        moving = set(rng.sample(range(cells), n_moving)) if n_moving else set()
        curr = list(prev)
        for i in moving:
            curr[i] = rng.random()
        abstain = sum(1 for a, b in zip(prev, curr) if psi(abs(b - a)) == -1)
        skipped_total += abstain
        prev = curr
    return skipped_total / (frames * cells)


def main():
    results = {}
    for cols, rows in GRIDS:
        cells = cols * rows
        for label, ratio in [("static-scene", 0.02), ("talking-head", 0.15), ("full-motion", 0.60)]:
            frac = simulate(FRAMES, cells, ratio)
            key = f"{cols}x{rows} {label}"
            results[key] = {
                "cells": cells,
                "abstain_fraction": round(frac, 4),
                "dispatch_fraction": round(1 - frac, 4),
                "expected_speedup": round(1 / max(1 - frac, 0.01), 2),
            }
            print(f"{key:32s} abstain={frac*100:5.1f}%  "
                  f"speedup≈{results[key]['expected_speedup']}x")

    out = {"seed": SYSTEM_SEED, "tau_motion": TAU_MOTION,
           "tau_static": TAU_STATIC, "frames": FRAMES, "results": results}
    with open(__file__.replace(".py", "_receipt.json"), "w") as f:
        json.dump(out, f, indent=2)
    print(f"\nreceipt → tools/jev_gate_receipt.json")


if __name__ == "__main__":
    t0 = time.time()
    main()
    print(f"elapsed: {time.time()-t0:.2f}s")
