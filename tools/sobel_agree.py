#!/usr/bin/env python3
"""
sobel_agree.py — offline agreement: plain-luma election vs Sobel-descriptor
election over 30 synthetic 480x360 frames (seed=20261001). VECTORIZED.

PRE-REGISTERED VERDICT RULE (R2, receipts/lane-b-sobel.md):
  agreement < 0.95 → Sobel carries NEW signal → integrate.
  agreement >= 0.95 → redundant → do not integrate.
"""
import numpy as np
import re, json, math

SEED = 20261001
W, H = 480, 360
COLS, ROWS = 120, 60
SUBW, SUBH = 4, 6
NUM_CELLS = COLS * ROWS

POP = np.array([bin(i).count("1") for i in range(256)], dtype=np.uint8)


def load_atlas():
    src = open("/root/.openclaw/workspace/repos/chiaroscuro/js/font_atlas.js").read()
    data = re.search(r"FONT_ATLAS_DATA\s*=\s*new Uint32Array\(\[([^\]]+)\]", src).group(1)
    return np.array([int(x.strip(), 0) for x in data.split(",") if x.strip()], dtype=np.uint32)


def popcount_u32(arr):
    """arr: (...,) uint32 → popcount uint8."""
    b = arr.view(np.uint8).reshape(arr.shape + (4,))
    return POP[b].sum(axis=-1)


def elect_all(sigs, atlas):
    """sigs: (N,) uint32 → elected index per cell. Bit-parallel."""
    x = sigs[:, None] ^ atlas[None, :]          # (N, G)
    pc = popcount_u32(x.reshape(-1)).reshape(x.shape)
    return pc.argmin(axis=1)


def luma_field(kind, rng, angle=None):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
    if kind == "diagonal":
        a = angle if angle is not None else rng.uniform(0, math.pi)
        f = np.sin((xx * math.cos(a) + yy * math.sin(a)) / 12.0)
        return (f > 0).astype(np.float64) * 0.8 + 0.1
    if kind == "disk":
        cx, cy = rng.uniform(100, 380), rng.uniform(80, 280)
        r = rng.uniform(30, 120)
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        return np.where(d < r, 0.9, 0.1).astype(np.float64)
    return rng.random((H, W))


def sobel_fields(gray):
    """Full-frame Sobel via shifted sums. Returns gx, gy, g, theta."""
    p = np.pad(gray, 1)
    gx = (-p[:-2, :-2] + p[:-2, 2:]) + 2.0 * (-p[1:-1, :-2] + p[1:-1, 2:]) \
         + (-p[2:, :-2] + p[2:, 2:])
    gy = (-p[:-2, :-2] - 2.0 * p[:-2, 1:-1] - p[:-2, 2:]) \
         + (p[2:, :-2] + 2.0 * p[2:, 1:-1] + p[2:, 2:])
    return gx, gy


def cell_blocks(field):
    """(360,480) → (60,120) mean over each 6x4 block."""
    return field.reshape(ROWS, SUBH, COLS, SUBW).mean(axis=(1, 3))


def plain_signatures(gray):
    bits = (gray > 0.5).astype(np.uint32)
    packed = bits.reshape(ROWS, SUBH, COLS, SUBW)
    sig = np.zeros((ROWS, COLS), dtype=np.uint32)
    for y in range(SUBH):
        for x in range(SUBW):
            sig |= (packed[:, y, :, x] << np.uint32(y * 4 + x))
    return sig.reshape(-1)


def glyph_bins(atlas):
    """Each glyph's own Sobel orientation bin from its 4x6 bit pattern."""
    bits = ((atlas[:, None] >> np.arange(24, dtype=np.uint32)[None, :]) & 1).astype(np.float64)
    field = bits.reshape(-1, 6, 4)  # (G, 6, 4)
    p = np.pad(field, ((0, 0), (1, 1), (1, 1)))
    gx = (-p[:, :-2, :-2] + p[:, :-2, 2:]) + 2.0 * (-p[:, 1:-1, :-2] + p[:, 1:-1, 2:]) \
         + (-p[:, 2:, :-2] + p[:, 2:, 2:])
    gy = (-p[:, :-2, :-2] - 2.0 * p[:, :-2, 1:-1] - p[:, :-2, 2:]) \
         + (p[:, 2:, :-2] + 2.0 * p[:, 2:, 1:-1] + p[:, 2:, 2:])
    ss = (np.sin(np.arctan2(gy, gx)) ).sum(axis=(1, 2))
    sc = (np.cos(np.arctan2(gy, gx)) ).sum(axis=(1, 2))
    theta = np.arctan2(ss, sc) + math.pi
    return np.minimum(15, (theta / (2 * math.pi / 16)).astype(int))


def main():
    rng = np.random.default_rng(SEED)
    atlas = load_atlas()
    gbins = glyph_bins(atlas)
    by_bin = {b: np.where(gbins == b)[0] for b in range(16)}

    scenes = [("diagonal", 10), ("disk", 10), ("noise", 10)]
    agree = {k: [] for k, _ in scenes}
    coverage = {k: [] for k, _ in scenes}

    for kind, n in scenes:
        for f in range(n):
            gray = luma_field(kind, rng)
            sigs = plain_signatures(gray)
            plain_e = elect_all(sigs, atlas)

            gx, gy = sobel_fields(gray)
            g_mag = np.hypot(gx, gy)
            theta = np.arctan2(gy, gx)
            # magnitude-weighted circular mean per cell
            cell_sin = cell_blocks(np.sin(theta) * g_mag).reshape(-1)
            cell_cos = cell_blocks(np.cos(theta) * g_mag).reshape(-1)
            cell_theta = np.arctan2(cell_sin, cell_cos) + math.pi
            cell_bin = np.minimum(15, (cell_theta / (2 * math.pi / 16)).astype(int))

            sobel_e = plain_e.copy()
            for b in range(16):
                mask = cell_bin == b
                subset = by_bin[b]
                if len(subset) == 0 or not mask.any():
                    if len(subset) == 0:
                        coverage[kind].append(0)
                    continue
                sub_sigs = sigs[mask]
                x = sub_sigs[:, None] ^ atlas[subset][None, :]
                pc = popcount_u32(x.reshape(-1)).reshape(x.shape)
                sobel_e[np.where(mask)[0]] = subset[pc.argmin(axis=1)]

            same = (plain_e == sobel_e).mean()
            agree[kind].append(float(same))
            if kind != "noise":
                nonempty = sum(1 for b in range(16) if len(by_bin[b]) > 0)
                coverage[kind].append(nonempty / 16)

    out = {
        "seed": SEED,
        "atlas": f"js/font_atlas.js ({len(atlas)} glyphs)",
        "frames": {k: n for k, n in scenes},
        "agreement": {k: {"mean": round(float(np.mean(v)), 4),
                          "min": round(float(np.min(v)), 4)} for k, v in agree.items()},
        "bin_nonempty_fraction": round(sum(1 for b in range(16) if len(by_bin[b]) > 0) / 16, 4),
        "verdict_rule": "integrate iff overall agreement < 0.95 (disagreement = new signal)",
    }
    means = [out["agreement"][k]["mean"] for k, _ in scenes]
    overall = float(np.mean(means))
    out["overall_agreement"] = round(overall, 4)
    out["verdict"] = ("INTEGRATE" if overall < 0.95 else "DO NOT INTEGRATE")
    print(json.dumps(out, indent=2))
    with open("/root/.openclaw/workspace/repos/chiaroscuro/tools/sobel_agree_receipt.json", "w") as fo:
        json.dump(out, fo, indent=2)
    print("\nreceipt -> tools/sobel_agree_receipt.json")


if __name__ == "__main__":
    main()
