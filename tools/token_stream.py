#!/usr/bin/env python3
"""
token_stream.py — JEPA-style codebook quantization of cell trajectories.

Lane D / RD-PLAN Round 4 item 2. Takes the SVD-projected trajectory space
from svd_eigenshape.py, builds a K-entry codebook by hand-rolled k-means,
encodes a window as token IDs, reconstructs, and measures:
  - reconstruction MSE on TRAIN sequence (seed=20260930)
  - reconstruction MSE on HOLDOUT sequence (seed=777)  <- overfit detector
  - reconstruction MSE under a NULL random codebook      <- R4-style floor
  - byte accounting vs the raw f64 window (1280x theory check)

No sklearn — numpy only. All seeds pinned (R3).
"""
import json
import numpy as np

SEED_TRAIN = 20260930
SEED_HOLDOUT = 777
K = 32
ITERS = 20
COLS, ROWS = 120, 60
NUM_CELLS = COLS * ROWS
WINDOW = 60
K_SVD = 3


def gen_cells(seed: int, n: int = NUM_CELLS) -> np.ndarray:
    """Same recipe as svd_eigenshape.py: three shape families + noise."""
    rng = np.random.default_rng(seed)
    cells = []
    for c in range(n):
        fam = c % 3
        if fam == 0:
            base, amp, freq, phase = 0.55, 0.35, 0.10, rng.uniform(0, 6.28)
            traj = base + amp * np.sin(2 * np.pi * freq * np.arange(WINDOW) / WINDOW + phase)
        elif fam == 1:
            base, amp, speed = 0.45, 0.30, rng.uniform(0.8, 1.2)
            traj = base + amp * np.sin(2 * np.pi * speed * np.arange(WINDOW) / WINDOW)
        else:
            base, amp, phase = 0.50, 0.15, rng.uniform(0, 6.28)
            traj = base + amp * np.sin(2 * np.pi * 0.20 * np.arange(WINDOW) / WINDOW + phase)
        traj += rng.normal(0, 0.02, WINDOW)
        cells.append(np.clip(traj, 0, 1))
    return np.array(cells)  # (NUM_CELLS, WINDOW)


def kmeans(points: np.ndarray, k: int, iters: int, seed: int) -> np.ndarray:
    """Hand-rolled k-means. points: (N, d). Returns centroids (k, d)."""
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(points), size=k, replace=False)
    cent = points[idx].copy()
    for _ in range(iters):
        # assign
        d2 = ((points[:, None, :] - cent[None, :, :]) ** 2).sum(-1)
        assign = d2.argmin(1)
        # update
        new = cent.copy()
        for j in range(k):
            m = assign == j
            if m.any():
                new[j] = points[m].mean(0)
        if np.allclose(new, cent):
            break
        cent = new
    return cent


def encode(points: np.ndarray, cent: np.ndarray) -> np.ndarray:
    d2 = ((points[:, None, :] - cent[None, :, :]) ** 2).sum(-1)
    return d2.argmin(1)


def main():
    X_train = gen_cells(SEED_TRAIN)          # (7200, 60)
    X_hold = gen_cells(SEED_HOLDOUT)

    # SVD basis from TRAIN only (projection must not see holdout)
    U, S, Vt = np.linalg.svd(X_train, full_matrices=False)
    V = Vt[:K_SVD]                            # (3, 60) temporal basis
    P_train = X_train @ V.T                   # (7200, 3)
    P_hold = X_hold @ V.T

    # real codebook
    cent = kmeans(P_train, K, ITERS, seed=99)
    # null codebook: uniform random in train point bbox
    rng = np.random.default_rng(1234)
    lo, hi = P_train.min(0), P_train.max(0)
    cent_null = rng.uniform(lo, hi, size=(K, K_SVD))

    results = {}
    for name, P, X in [("train", P_train, X_train), ("holdout", P_hold, X_hold)]:
        for cb_name, cb in [("real", cent), ("null", cent_null)]:
            tok = encode(P, cb)
            rec_p = cb[tok]                   # (7200, 3) centroid projection
            rec_x = rec_p @ V                 # back to pixel space
            mse = float(((rec_x - X) ** 2).mean())
            results[f"{name}_{cb_name}_mse"] = mse
            if cb_name == "real":
                results[f"{name}_tokens"] = tok.tolist()

    # byte accounting — PER WINDOW (60 frames), consistent denominators
    raw_bytes = NUM_CELLS * WINDOW * 8                    # f64 window: 3,456,000
    token_bits = NUM_CELLS * WINDOW * (K.bit_length() - 1)  # 5-bit id per cell per frame
    token_bytes = (token_bits + 7) // 8                   # bit-packed
    svd_bytes = NUM_CELLS * K_SVD * 4                     # f32 k=3 coeffs per cell
    out = {
        "seeds": {"train": SEED_TRAIN, "holdout": SEED_HOLDOUT, "kmeans": 99, "null": 1234},
        "K": K, "iters": ITERS, "k_svd": K_SVD, "window": WINDOW,
        "mse": {k: round(v, 6) for k, v in results.items() if k.endswith("mse")},
        "overfit_gap": round(results["train_real_mse"] / results["holdout_real_mse"], 4),
        "null_lift": round(results["holdout_null_mse"] / results["holdout_real_mse"], 2),
        "bytes_per_window": {
            "raw_f64": raw_bytes,
            "token_stream_bitpacked": token_bytes,
            "svd_f32_floor": svd_bytes,
            "compression_tokens": round(raw_bytes / token_bytes, 1),
            "compression_svd_floor": round(raw_bytes / svd_bytes, 1),
            "note": "SVD floor wins on synthetic data because k=3 captures "
                    "98.6% variance; tokens earn their place only if discrete-"
                    "symbol prediction beats regression on coefficients.",
        },
    }
    print(json.dumps(out, indent=2))
    with open("/root/.openclaw/workspace/repos/chiaroscuro/tools/token_stream_receipt.json", "w") as f:
        json.dump(out, f, indent=2)
    print("\nreceipt -> tools/token_stream_receipt.json")

    # also emit a tiny sample token stream (first 16 cells) as evidence
    print("sample tokens (cells 0..15, train):", results["train_tokens"][:16])


if __name__ == "__main__":
    main()
