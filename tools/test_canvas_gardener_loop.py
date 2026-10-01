#!/usr/bin/env python3
"""
Ternary Jev lifecycle simulation over a cell grid (pure CPU reference).

psi(v) maps the weighted state delta to {-1, 0, 1}:
  1  (Value)   v >  TAU_MOTION
  0  (Formula) TAU_STATIC <= v <= TAU_MOTION
 -1  (Abstain) v <  TAU_STATIC   (pruned from downstream processing)

Reference implementation for the JS port (RD-PLAN Round 3, item 2).
"""
import random

SYSTEM_SEED = 20260930
GRID_SIZE = 9  # 3x3 evaluation patch bounds
TAU_MOTION = 0.35
TAU_STATIC = 0.05


def psi(v: float) -> int:
    if v > TAU_MOTION:
        return 1
    if v >= TAU_STATIC:
        return 0
    return -1


def cell_delta(state_t, state_t1, weights=(1.0, 0.7)):
    dl = abs(state_t1["L"] - state_t["L"])
    dtheta = abs(state_t1["theta"] - state_t["theta"])
    return weights[0] * dl + weights[1] * dtheta


def main():
    rng = random.Random(SYSTEM_SEED)
    print(f"[JEV] seed={SYSTEM_SEED} grid={GRID_SIZE}x{GRID_SIZE} "
          f"tau_motion={TAU_MOTION} tau_static={TAU_STATIC}")

    frame_a = [{"L": rng.random(), "theta": rng.uniform(-3.14, 3.14)} for _ in range(GRID_SIZE * GRID_SIZE)]
    frame_b = [{"L": rng.random(), "theta": rng.uniform(-3.14, 3.14)} for _ in range(GRID_SIZE * GRID_SIZE)]

    counts = {1: 0, 0: 0, -1: 0}
    for a, b in zip(frame_a, frame_b):
        counts[psi(cell_delta(a, b))] += 1

    total = GRID_SIZE * GRID_SIZE
    print(f"[JEV] Value={counts[1]} Formula={counts[0]} Abstain={counts[-1]} "
          f"({100.0 * counts[-1] / total:.1f}% pruned)")


if __name__ == "__main__":
    main()
