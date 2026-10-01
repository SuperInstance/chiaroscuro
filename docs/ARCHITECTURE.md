# ARCHITECTURE — Tier Map + Component Matrix

## §1. Structural Tier Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                   THE ORCHESTRATION LAYER                       │
│  (Cloudflare Worker edge bot / NL → dial deltas)                │
├─────────────────────────────────────────────────────────────────┤
│ Parses natural language prompts into explicit dial adjustments. │
│ One namespace (R5). Deterministic first-match rules (R3).       │
└────────────────────────────────┬────────────────────────────────┘
                                 │  {status, active_ledger_delta} JSON
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                   THE DOOR LAYER                                │
│  mirror / sculptor / studio / director / viewfinder / webgpu    │
├─────────────────────────────────────────────────────────────────┤
│ Five CPU engines (this repo, doors Ⅰ-Ⅴ) + one GPU engine        │
│ (door Ⅵ, webgpu.html). All implement the same election contract.│
└────────────────────────────────┬────────────────────────────────┘
                                 │  elected glyph grid
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                   THE REFERENCE TOOLS LAYER                     │
│  forge_twin / jev_gardener / spatial_drift / (R4: token_stream) │
├─────────────────────────────────────────────────────────────────┤
│ Pure-CPU references: packaging, temporal gating, drift metric,  │
│ compression receipts. Each verified in receipts/round-1.md.     │
└────────────────────────────────┬────────────────────────────────┘
                                 │  atlas + constraints
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                   THE RASTERIZER LAYER                          │
│           (font_atlas_packager — separate Rust repo)            │
├─────────────────────────────────────────────────────────────────┤
│ .ttf/.otf outlines → 4×6 subpixel coverage → 24-bit u32 atlas.  │
│ Round 1: simulated glyph path. Round 2: real Bézier ray cast.   │
└─────────────────────────────────────────────────────────────────┘
```

## §2. Component Matrix

| Component | Intent | Input | Output | Perf Target |
|---|---|---|---|---|
| `font_atlas_packager` (Rust) | outlines → 24-bit signatures | .ttf/.otf | ~280-byte atlas | µs init pass |
| `webgpu.html` + bridge + WGSL | parallel XOR election | packed u32 cells | glyph index grid | 60 FPS locked |
| CPU doors Ⅰ-Ⅴ | election on CPU | image patches | text grid | 20-32 fps (measured in README) |
| `edge/worker.ts` | NL → dial deltas | text prompt | tiny JSON | ms edge pulse |
| `tools/*` | references + packaging | varied | verified artifacts | n/a |

## §3. Election Contract (all engines)

1. Rasterize glyph set into 4×6-bitmap signatures, one u32 per glyph.
2. Per cell: compute the 4×6 signature of the image patch.
3. Compare against every glyph signature: Hamming distance (bit count of XOR).
4. Lowest distance wins. Tie-break: lowest glyph index (deterministic).

CPU doors measure 70 elections/cell at 20-32 fps. Door Ⅵ targets the same
contract at 60 fps via 16×16 workgroup parallelism.

## §4. Standing namespace rule (cog-lab CG-1 carryover)

Template fields in the edge bot resolve against exactly ONE context object
(the request JSON), documented in the worker file itself. No second evaluator
with a differing scope may consume the same spelling. Enforced by R5.
