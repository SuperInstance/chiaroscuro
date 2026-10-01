# Pre-registration ADDENDUM — CAST v2: zero-evidence modality fallback

**Sealed BEFORE any v2 run.** v1 receipt (tools/cast_eval_receipt.json) stays
UNCHANGED with verdict FAIL — no goalpost moves. v2 is a NEW experiment.

## Mechanism (fly analog: broadly-tuned receptors when the plume is silent)

v1 failure mode (receipted autopsy, tools/cast_diag.js): all 4 degraded-suite
failures are ZERO-EVIDENCE prompts — no graph term hits, no fuzzy-1 neighbor.
Graph widening cannot create signal from absent vocabulary. v2 CAST fires only
on zero evidence and adds a second-modality read:

- Trigger: canonical match yields 0 hits (score 0, default route).
- Action: for every prompt token with len >= 4, compute char-bigram Jaccard
  similarity against EVERY flattened graph term (phrases included); if
  sim >= 0.5, append a weak hit {cls, weight = 1.0 * sim} for the best match.
- Anti-thrash pins: fallback runs ONLY when canonical hits == 0; it never
  overrides a non-default canonical route; one hit per token max; sim floor
  0.5 (receipted constant).

## Hypotheses (pass bars fixed here)

- H1: v2 recovers >= 2 of the 4 zero-evidence failures on the same 58-prompt
  suite (seed 20261001, same corruptions as v1).
- H2: zero regressions — all 54 currently-correct prompts route identically;
  clean 50 stays 50/50.
- H3: fallback fires on <= 12 of 58 prompts (bounded exploration, not a
  default crutch).
- Null: v1 runner output is the null (already receipted).

Suite, seed, graph, thresholds, and the anti-thrash overtake rule from the
base pre-registration carry over unchanged.
