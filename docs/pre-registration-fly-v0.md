# Pre-registration — fly-stack v0 (builds 4.1, 4.3, 4.2, 4.4 of docs/FRUITFLY-JEV-MOTH.md)

**Sealed BEFORE any run in this stack.** R1/R3: hypotheses, metrics, seeds, pass bars, null controls fixed here.
Branch: `fly-stack-v0` (off `edge-nl-graph`). Seed for all stochastic draws: **20261001**.

---

## Build 4.1 — flycx v0 (tools/fly_cx.py): ring-attractor compass with JEV ternary cue gating

Model: 16-bin ring. Belief = (θ position, A amplitude ∈ [0,1]). Each tick: θ += ω·dt.
Cues arrive as (angle, confidence). Per cue, JEV evaluation:
- `d` = angular distance cue↔bump (deg), `conf` = cue confidence.
- **Commit ψ=+1**: `conf ≥ 0.35` (TAU_MOTION pin) AND `d ≤ 30°` → θ blends toward cue
  (Δ = 0.4·d), A ← min(1, A + 0.1).
- **Reject ψ=−1**: `conf ≥ 0.35` AND `d > 30°` → θ unchanged, **A ×= 0.7** (circKF
  belief-shortening, FRUITFLY-JEV-MOTH §3).
- **Abstain ψ=0**: `conf < 0.35` → no change (10 s dark-hold analog).

Tests (all seed 20261001, dt=0.02, ω=0 unless stated):
- **T1** zero input, 500 ticks: drift ≤ 5°/s. [sanity]
- **T2** consistent cues (angle 90°, conf 0.8) every 10 ticks ×20: |θ − 90°| ≤ 10° at end.
- **T3** after T2, ONE conflicting cue (angle 270°±10, conf 0.8): A drops ≥ 30%
  (one-shot 0.7 factor ⇒ exactly 30% floor) AND |Δθ| ≤ 15°.
- **T4** after T2, 500 cueless ticks: |Δθ| ≤ 10° total drift (ring maintenance).
- **Null control**: same stream with ψ forced +1 always (naive re-anchor): T3 shows
  |Δθ| > 60° (proves the Reject branch is doing the work, not the blend gain).
- Receipt: tools/fly_cx_receipt.json — seed, per-cue ψ log, fnv1a-64 chained trajectory
  hash, test verdicts.

## Build 4.3 — JEV v2 HOLD/CAST (js/jev_gate_v2.js + tools/cast_route.js)

Module: `evaluate(cue, state)` → `{ psi, mode }`; mode ∈ {value, formula, hold, cast}.
Confidence register C: +0.10 on Commit, −0.15 on Reject, else ×0.98 decay toward 0.5.
CAST iff psi=0 AND (lastPsi === −1 OR C < 0.35). Cast cap: 3 consecutive; then forced hold.
Router policy sim (tools/cast_route.js, seed 20261001):
- Degraded suite: 50 prompts = seeded corruptions of edge/eval_prompts.json —
  per-word char drop/swap (p=0.15) + 8 unseen-phrasing rewrites of the same labels.
- CAST trigger: best score < 1.5×threshold OR (top1−top2) < 0.5.
- CAST action: rematch with fuzzy_min 4→3, negation window 2→4, weights +0.5/band;
  CAST overtakes narrow winner only if wide_best ≥ narrow_best + 0.5 (anti-thrash pin).
- **Hypothesis H-cast**: degraded top-1 improves ≥ 10 points over narrow-only; clean 50
  stays 50/50; mean candidates scored per degraded prompt ≤ 3× narrow (no thrash).
- Null: degraded suite with CAST disabled (measured, not assumed).
- Receipt: tools/cast_eval_receipt.json.

## Build 4.2 — KC layer (tools/kc_layer.py): fly MB over the synonym graph

- PN layer: flattened-graph term vector, V = |flat terms| (~200 dims), value = band weight
  of matched terms (same matcher as router, incl. fuzzy-1).
- KC layer: seeded random projection V→2048 (RNG seed 20261001), WTA top-102 (5%).
- MBON: per-class readout W[5][2048], init 1.0; score = Σ active-KC weights.
- Plasticity (depression-only, active-KC-only): on mistake W[pred][k] ×= (1−η), η=0.2.
  Correct → no write. **Locality pin**: ≤102 rows touched per update (receipt asserts).
- Tests: (a) 5-fold seeded CV over the 50 clean prompts: mean top-1 ≥ 0.90.
  (b) zero-shot on the 50 degraded (trained once on all 50 clean): ≥ router-on-degraded.
  (c) interference: train classes {woodcut,terminal,soft} → train {harsh} → retest first
  trio: accuracy drop ≤ 5 points (synaptic-freezing property).
- Null: random-guess baseline + a dense-linear (no expansion) learner, same updates.
- Receipt: tools/kc_layer_receipt.json.

## Build 4.4 — Moth notary (tools/moth_notary.py)

- Chained fnv1a-64 ledger (MicroMoth-quilt cell-ledger format: BIND inputs → LINK chain →
  TICK per check → PROOF final hash) over the three receipts above.
- If SuperInstance/MicroMoth-quilt clones clean, execute BIND/TICK/PROOF for real via
  micromoth.py; else seal the format-compatible ledger and mark cell-execution PENDING
  (honest, no simulated claim of quantum execution).
- Receipt: tools/moth_notary_receipt.json.

## Kill criterion
R8: any build with no signal after 15 min of work stops, writes a negative receipt, and
the stack proceeds without it.
