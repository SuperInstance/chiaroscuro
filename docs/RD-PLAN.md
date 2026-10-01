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

## Round 3 — Edge Intelligence

1. Worker: replace keyword table with a bounded mapping (tiny embedded model
   or weighted synonym graph). Pre-register eval set of 50 prompts; measure
   top-1 dial-set accuracy against hand labels.
2. Jev-gated frame diffing (JS port of `test_canvas_gardener_loop.py`) —
   skip static cells between GPU dispatches. Measure FPS delta on 120×60.
3. Voice/NL loop — ONLY after a written spec lands in docs/ (canon describes
   it, no code exists; do not build from prose).

## Round 4 — Distillation Layer

1. SVD eigenshape extractor (NumPy or Rust ndarray) over recorded cell
   trajectories. Verify k=3 captures ≥90% variance on a 60-frame window.
2. JEPA-style codebook quantization of trajectories → token stream.
   Deliverable: `tools/token_stream.py` emitting k×T byte arrays.
3. Receipt: 6.2MB frame → measured byte count vs the k×T theoretical bound.

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
