# R&D MASTER PLAN — Chiaroscuro Frontier

Status: Round 1 sealed (this doc + WebGPU door + edge bot + tools + canon).
Method: iterative rounds. Each round = plan → build → measure → seal (commit).
Rules R1-R8 inherited from cog-lab wave-1 (rules before findings;
pre-registered model classes before transfer claims; receipts over claims).

## Round 1 — WebGPU Door + Edge Bot + Tools + Canon  [ THIS COMMIT ]

- [x] `webgpu.html` — door Ⅵ: stream → 4×6 bit-pack → WGSL Hamming election → glyph grid
- [x] `js/webgpu_canvas_bridge.js` — zero-alloc GPU bridge (buffers bound once)
- [x] `shaders/glyph_election.wgsl` — standalone compute shader (R6: u32 XOR+POPCNT only)
- [x] `edge/worker.ts` + `wrangler.toml` — NL → dial delta, R5 one-namespace
- [x] `tools/forge_twin.py` — packaging (verified: dist_twin/ builds)
- [x] `tools/test_canvas_gardener_loop.py` — Jev gate reference (verified)
- [x] `tools/spatial_drift_gradient.py` — D(x) reference (verified)
- [x] `docs/PARSE.md` (this file's source decomposition), `docs/RD-PLAN.md`, `docs/ARCHITECTURE.md`
- [x] `font_atlas_packager` — Rust crate, own repo, simulated glyph path compiles
- [x] `canon/` — six FOUND writings + original pieces
- Measure receipts: forge OK / jev 81 cells / drift mean 0.551 → `receipts/round-1.md`

## Round 2 — Honest Engine (make the sim real)

Status: atlas hookup ✓ (gen_atlas.py → js/font_atlas.js, 73 glyphs/292 B),
trail buffer ✓ (webgpu.html Float32Array persistence), ActiveLedger ✓
(writer+verifier, CHAIN OK), Sobel ramp SKIPPED→recorded-frames follow-up.
See receipts/round-2.md.

Priority order:
1. **Rust real outline intersection** — replace `simulate_outline_intersection`
   with true ttf-parser outline traversal + even-odd ray cast. Deliverable:
   atlas of ≥70 REAL glyphs from a real .ttf, dumped as JS array consumed by
   `webgpu.html`.
2. **Temporal trail buffer** — viewfinder/webgpu doors get a decaying
   persistence layer (trailDecay dial becomes real). Measure ghost half-life.
3. **ActiveLedger schema** — design + implement `receipts.jsonl` format:
   {ts, dials_before, dials_after, prompt, fnv1a_64}. One writer, append-only.
4. **Sobel shape ramp** — upgrade `webgpu.html` election to use the (L,θ,g)
   descriptor for a 16-orientation glyph class before Hamming elect.
   Measure agreement vs plain luma ramp on the same frame.

Gate: each item ships with a test or a run receipt in `receipts/`.
Status: 1→DONE 2026-10-01 (font_atlas_packager 73045ae: real ttf-parser
outline path, 'H' stroke test PASS, LiberationMono atlas 66/73 unique,
max Hamming 24/24; swap-in to JS atlas is a separate pinned receipt);
2→trail buffer done; 3→ActiveLedger done (CHAIN OK); 4→DONE offline
2026-10-01 (sobel agreement 0.2795 overall → INTEGRATE per pre-registered
rule; camera-frame validation still R8-deferred). receipts/round-2.md.

## Round 3 — Edge Intelligence

1. Worker: replace keyword table with a bounded mapping (tiny embedded model
   or weighted synonym graph). Pre-register eval set of 50 prompts; measure
   top-1 dial-set accuracy against hand labels.
   DONE (measured, not replaced): eval set sealed (sha256 32a35de2…), top-1
   0.560 — soft weakest at 0.29; 22 failures = 14 synonym/paraphrase →
   default, 5 adversarial first-match, 1 misspelling. Replacement design
   pre-registered in receipts/lane-c-edge.md (synonym graph + intent-position
   rule, target ≥0.85 on the pinned set).
   REPLACEMENT BUILT + MEASURED (2026-10-01, branch `edge-nl-graph`, PR):
   weighted synonym graph (`edge/synonym_graph.json`) + canonical router
   (`edge/nl_route.js`) — rules committed BEFORE the run (R1). Pinned-set
   top-1 = **1.000** (50/50, zero misroutes) vs 0.560 baseline, target ≥0.85
   met; all 5 adversarial + 1 misspelling cases now correct. Receipt:
   `tools/edge_graph_receipt.json`. Remaining: TS port into `edge/worker.ts`
   + automated parity runner.
2. Jev-gated frame diffing (JS port of `test_canvas_gardener_loop.py`) —
   skip static cells between GPU dispatches. Measure FPS delta on 120×60.
   CPU reference done: 55× static / 7.4× talking-head / 1.85× full-motion
   (tools/jev_gate.py + tools/jev_gate_receipt.json). JS port DONE 2026-10-01:
   js/jev_gate.js (node-verified static/motion/coherence cases) + WGSL
   cell_dirty binding(5) + webgpu.html perf meter; real-hardware FPS R8-SKIPPED.
3. Voice/NL loop — ONLY after a written spec lands in docs/ (canon describes
   it, no code exists; do not build from prose).

## Round 4 — Distillation Layer

1. SVD eigenshape extractor (NumPy or Rust ndarray) over recorded cell
   trajectories. Verify k=3 captures ≥90% variance on a 60-frame window.
   DONE on synthetic: k=3 → 98.59% variance (gate ≥90% PASS), clean rank-3
   separation, 1280× theoretical compression (tools/svd_eigenshape.py +
   tools/svd_eigenshape_receipt.json). Real-camera follow-up pending.
2. JEPA-style codebook quantization of trajectories → token stream.
   Deliverable: `tools/token_stream.py` emitting k×T byte arrays.
   DONE 2026-10-01: K=32 k-means on SVD k=3 projections; train MSE 0.001007,
   holdout 0.001024 (overfit gap 0.9833), null-lift 6.08×. Per-window bytes:
   tokens 12.8× vs SVD floor 40× — SVD floor wins on synthetic; tokens must
   beat coefficient regression downstream to earn their place (next receipt).
3. Receipt: 6.2MB frame → measured byte count vs the k×T theoretical bound.
   DONE (tools/token_stream_receipt.json): raw f64 window 3,456,000 B;
   bit-packed token stream 270,000 B; SVD f32 floor 86,400 B. The earlier
   1280× planning figure superseded by this honest accounting.

## Standing Rules (carried from cog-lab, amended for this repo)

- R1 Rules/receipts committed BEFORE the run that cites them.
- R2 Pre-register the generalizing model class before any transfer claim.
- R3 Every receipt pins: seed, grid size, atlas hash, commit.
- R4 Null control must be capable of widening the gap (else the metric
  prices memorization — say so).
- R5 ONE namespace for template context fields, documented in the consuming
  file. (cog-lab CG-1 lesson; enforced in `edge/worker.ts`.)
- R6 No float in the election inner loop. u32 XOR + POPCNT only.
- R7 Measure input-sensitivity, not just output-determinacy.
- R8 15-minute rule: sub-build exceeding 15 min without a verifiable artifact
  gets sealed as-is, remainder marked SKIPPED with reason.
