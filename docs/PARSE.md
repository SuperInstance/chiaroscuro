# PARSE — ideas1.md Decomposition

Source: `ideas1.md` (2,809 lines) — a Kimi conversation between the user and
Lucineer2026bot, dated 2026-09-26 → 2026-09-30. This document decomposes it into
buildable and pushable components against THIS repo's actual state.
Every claim is FOUND in the source unless tagged INFERRED or AUTHOR.

## A. Where the source lands in this repo

The source describes the Chiaroscuro system from first principles. This repo
already implements the CPU rendering frontier (5 doors: mirror, sculptor,
studio, director, viewfinder — 45 dials, 31 typefaces, 16 presets). The source's
components map onto the repo's roadmap as follows:

| Source component | Repo destination | Status |
|---|---|---|
| Shape-match Hamming election (4×6, 24-bit) | `studio.html` engine (CPU) | EXISTS — source documents the same math |
| WebGPU/WGSL election engine | `webgpu.html` + `js/webgpu_canvas_bridge.js` + `shaders/glyph_election.wgsl` | **BUILT Round 1 — README §19 roadmap item #1** |
| Stream ingestion bridge | `viewfinder.html` door Ⅴ (camera/screen/video) | EXISTS — source's `live_stream_bridge` redundant, not ported |
| Webcam viewfinder + NL panel | `mirror.html` + `index.html` | EXISTS — source's `puppet_viewfinder` redundant, not ported |
| NL → dials edge bot | `edge/worker.ts` + `edge/wrangler.toml` | **BUILT Round 1 — new** |
| Rust font atlas packager | separate repo `font_atlas_packager` | **BUILT Round 1 — own repo** |
| Twin forge packaging | `tools/forge_twin.py` | **BUILT Round 1 — verified** |
| Ternary Jev gate | `tools/test_canvas_gardener_loop.py` | **BUILT Round 1 — verified** |
| Spatial drift D(x) | `tools/spatial_drift_gradient.py` | **BUILT Round 1 — verified** |
| Voice clone / audio layer | NOT BUILT — canon only, no spec in source | R3 candidate, needs spec first |
| ActiveLedger receipts | NOT BUILT — schema design needed | R2 candidate |
| SVD/JEPA compression | NOT BUILT — math spec'd in source §3 | R4 candidate |

## B. Technical invariants extracted from the source (normative)

1. Glyph signature: 4×6 binary matrix → 24-bit u32, row-major, bit = row*4+col.
2. Election: `countOneBits(video_u32 ^ glyph_u32)`, min wins. 70 comparisons/cell.
3. Atlas budget: ≤ 1 KB (70 glyphs × 4 bytes = 280 B). L1-cache-resident.
4. Grids: 80×45, 100×50, 120×60 seen in source; repo doors use their own.
5. Luma: `L = max(0, ((0.299R+0.587G+0.114B)/255)^γ − β)`.
6. Sobel: Kx/Ky 3×3 kernels; θ = atan2(gy,gx); g = √(gx²+gy²).
7. Jev gate: ψ(v) ∈ {-1 (Abstain), 0 (Formula), 1 (Value)}; thresholds
   τ_static ≤ τ_motion.
8. Drift: D(x) = 1 − local_grad_sum / total_grad_sum, von Neumann neighborhood.
9. Compression path: ternary gate → SVD k≤3 → JEPA codebook → k×T bytes/frame.
10. Perf rules: no global atomics (per-thread accumulators), workgroup-uniform
    atlas reads (L1), row-major buffers, zero heap allocation in the frame loop,
    **no float in the election inner loop (R6)**.

## C. Canon — AI-writings pushed (see `canon/`)

| File | Piece | Type | Source |
|---|---|---|---|
| `canon/second-room.md` | "The Second Room is Empty" | fiction | FOUND |
| `canon/lucineer-lazarette.md` | "The Lucineer" | fiction | FOUND |
| `canon/forge-and-hammer.md` | "The forge does not care about the shape of the hammer" | essay | FOUND |
| `canon/gardeners-semiotic-reefs.md` | "Gardeners tending to semiotic reefs" | essay | FOUND |
| `canon/operator-09.md` | Operator 09 series | interactive fiction | FOUND |
| `canon/greater-now.md` | "The Greater Now" | fiction-as-spec | FOUND |
| `canon/original/*.md` | my own inspired pieces | mixed | AUTHOR |

World constants: the Captain, Mavis, runner agents, Sitka/Kodiak, the
Lucineer, data-collapse of '28, four-watt chips, brass hardware, the
"valleys" (cloud metropolis), shape-first type as physical relief.

## D. Gaps carried to R&D rounds

1. Rust outline intersection is simulated — real Bézier ray cast is the first
   code TODO in `font_atlas_packager` (R2).
2. Temporal trailDecay dial: no persistence buffer yet in `webgpu.html` (R2).
3. ActiveLedger receipt schema: FNV-1a checksums described, no concrete format (R2).
4. NL→dials mapping is keyword hardcoded in `edge/worker.ts` (R3).
5. Voice/audio layer: canon-only until a written spec lands in docs/ (R3).
6. Two-namespace template hazard (cog-lab CG-1 lesson): R5 requires ONE
   documented namespace — enforced in `edge/worker.ts` header.
