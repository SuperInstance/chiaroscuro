#!/usr/bin/env python3
"""
sobel_agree.py — offline agreement: plain-luma election vs Sobel-descriptor
election over 30 synthetic 480x360 frames (seed=20261001).

PRE-REGISTERED VERDICT RULE (R2, receipts/lane-b-sobel.md):
  agreement < 0.95 → Sobel carries NEW signal → integrate.
  agreement >= 0.95 → redundant → do not integrate.

Scene types (10 frames each):
  diagonal — edges at varying angles (orientation signal strong)
  disk     — circles (orientation varies within cell)
  noise    — gaussian static (no orientation signal)

Election = min Hamming over the real 73-glyph atlas (js/font_atlas.js),
same contract as the WGSL shader. Plain uses 24 threshold bits;
Sobel gates the sweep to same-bin glyphs (bin = per-glyph precomputed
orientation), falling back to full sweep when the bin subset is empty.
"""
import numpy as np
import re, json, math

SEED = 20261001
W, H = 480, 360
COLS, ROWS = 120, 60
SUBW, SUBH = 4, 6
NUM_CELLS = COLS * ROWS
KX = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]])
KY = KX.T


def load_atlas():
    src = open("/root/.openclaw/workspace/repos/chiaroscuro/js/font_atlas.js").read()
    data = re.search(r"FONT_ATLAS_DATA\s*=\s*new Uint32Array\(\[([^\]]+)\]", src).group(1)
    return [int(x.strip(), 0) for x in data.split(",") if x.strip()]


def elect(sig, atlas):
    best, bi = 9999, 0
    for i, g in enumerate(atlas):
        d = bin(sig ^ g).count("1")
        if d < best:
            best, bi = d, i
    return bi


def luma_field(kind, rng, angle=None):
    yy, xx = np.mgrid[0:H, 0:W]
    if kind == "diagonal":
        a = angle if angle is not None else rng.uniform(0, math.pi)
        f = np.sin((xx * math.cos(a) + yy * math.sin(a)) / 12.0)
        return (f > 0).astype(float) * 0.8 + 0.1
    if kind == "disk":
        cx, cy = rng.uniform(100, 380), rng.uniform(80, 280)
        r = rng.uniform(30, 120)
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        return np.where(d < r, 0.9, 0.1).astype(float)
    return rng.random((H, W))


def sobel_descriptor(gray, cellX, cellY):
    """Returns (bin, g) for one cell via magnitude-weighted circular mean."""
    x0, y0 = cellX * SUBW, cellY * SUBH
    pad = np.pad(gray, 1)
    sum_sin = sum_cos = sum_g = 0.0
    for sy in range(SUBH):
        for sx in range(SUBW):
            px, py = x0 + sx + 1, y0 + sy + 1
            win = pad[py - 1:py + 2, px - 1:px + 2]
            gx = float((win * KX).sum())
            gy = float((win * KY).sum())
            g = math.hypot(gx, gy)
            th = math.atan2(gy, gx)
            sum_g += g
            sum_sin += math.sin(th) * g
            sum_cos += math.cos(th) * g
    theta = math.atan2(sum_sin, sum_cos)
    t = theta + math.pi
    bin_ = min(15, int(t / (2 * math.pi / 16)))
    return bin_, sum_g / (SUBW * SUBH)


def glyph_bins(atlas):
    """Each glyph's own orientation: interpret its 24 bits as a 4x6 field,
    run the same Sobel circular mean. Atlas glyphs ARE 4x6 patterns."""
    bins = []
    for sig in atlas:
        field = np.array([[(sig >> (y * 4 + x)) & 1 for x in range(4)] for y in range(6)],
                         dtype=float)
        pad = np.pad(field, 1)
        ss = sc = 0.0
        for y in range(6):
            for x in range(4):
                win = pad[y:y + 3, x:x + 3]
                gx = float((win * KX).sum()); gy = float((win * KY).sum())
                g = math.hypot(gx, gy)
                th = math.atan2(gy, gx)
                ss += math.sin(th) * g; sc += math.cos(th) * g
        t = math.atan2(ss, sc) + math.pi
        bins.append(min(15, int(t / (2 * math.pi / 16))))
    return bins


def main():
    rng = np.random.default_rng(SEED)
    atlas = load_atlas()
    gbins = glyph_bins(atlas)
    by_bin = {}
    for i, b in enumerate(gbins):
        by_bin.setdefault(b, []).append(i)

    scenes = [("diagonal", 10), ("disk", 10), ("noise", 10)]
    agree = {k: [] for k, _ in scenes}
    coverage = {k: [] for k, _ in scenes}   # fraction of cells with non-empty bin subset

    for kind, n in scenes:
        for f in range(n):
            gray = luma_field(kind, rng)
            cells_plain = np.zeros((ROWS, COLS), dtype=int)
            cells_sobel = np.zeros((ROWS, COLS), dtype=int)
            have_subset = 0
            for cy in range(ROWS):
                for cx in range(COLS):
                    x0, y0 = cx * SUBW, cy * SUBH
                    cell = gray[y0:y0 + SUBH, x0:x0 + SUBW]
                    sig = 0
                    for y in range(SUBH):
                        for x in range(SUBW):
                            if cell[y, x] > 0.5:
                                sig |= 1 << (y * 4 + x)
                    cells_plain[cy, cx] = elect(sig, atlas)
                    bin_, _ = sobel_descriptor(gray, cx, cy)
                    subset = by_bin.get(bin_, [])
                    if subset:
                        have_subset += 1
                        best, bi = 9999, cells_plain[cy, cx]
                        for gi in subset:
                            d = bin(sig ^ atlas[gi]).count("1")
                            if d < best:
                                best, bi = d, gi
                        cells_sobel[cy, cx] = bi
                    else:
                        cells_sobel[cy, cx] = cells_plain[cy, cx]
            same = (cells_plain == cells_sobel).mean()
            agree[kind].append(float(same))
            coverage[kind].append(have_subset / NUM_CELLS)

    out = {
        "seed": SEED,
        "atlas": f"js/font_atlas.js ({len(atlas)} glyphs)",
        "frames": {k: n for k, n in scenes},
        "agreement": {k: {"mean": round(float(np.mean(v)), 4),
                          "min": round(float(np.min(v)), 4)} for k, v in agree.items()},
        "bin_subset_coverage": {k: round(float(np.mean(v)), 4) for k, v in coverage.items()},
        "verdict_rule": "integrate iff agreement < 0.95 (disagreement = new signal)",
    }
    means = [out["agreement"][k]["mean"] for k, _ in scenes]
    overall = float(np.mean(means))
    out["overall_agreement"] = round(overall, 4)
    out["verdict"] = ("INTEGRATE" if overall < 0.95 else "DO NOT INTEGRATE")
    print(json.dumps(out, indent=2))
    with open("/root/.openclaw/workspace/repos/chiaroscuro/tools/sobel_agree_receipt.json", "w") as f:
        json.dump(out, f, indent=2)
    print("\nreceipt -> tools/sobel_agree_receipt.json")


if __name__ == "__main__":
    main()
