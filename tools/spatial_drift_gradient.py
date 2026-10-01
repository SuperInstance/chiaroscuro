#!/usr/bin/env python3
"""
Spatial Drift Metric D(x) monitor — pure CPU reference.

D(x) = 1 - sum_{i in N(x)} |grad s(x) A_k(i)| / sum_{all j} |grad s(x) A_k(j)|

Guards against non-local coordinate drift in the elected glyph grid.
Values near 1.0 = fully local structure; near 0 = gradient mass leaking
from outside the neighborhood.
"""
import json
import sys

NEIGHBORHOOD = 4  # von Neumann radius-1


def drift(grid, rows, cols):
    out = []
    for y in range(rows):
        for x in range(cols):
            c = grid[y * cols + x]
            local = 0.0
            total = 0.0
            for j in range(rows * cols):
                g = abs(grid[j] - c)
                total += g
                jy, jx = divmod(j, cols)
                if abs(jy - y) + abs(jx - x) <= NEIGHBORHOOD:
                    local += g
            out.append(1.0 - (local / total if total else 0.0))
    return out


def main():
    rows, cols = 8, 8
    grid = [(i * 7 + 3) % 70 for i in range(rows * cols)]
    d = drift(grid, rows, cols)
    mean = sum(d) / len(d)
    print(json.dumps({
        "rows": rows, "cols": cols, "cells": len(d),
        "mean_drift": round(mean, 4),
        "max_drift": round(max(d), 4),
        "min_drift": round(min(d), 4),
    }, indent=2))


if __name__ == "__main__":
    sys.exit(main())
