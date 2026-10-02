# CAST v3 — Vocab-Expansion Pre-Registration (SEALED BEFORE ANY RUN, R1)

Sealed: 2026-10-01, before any v3 code or measurement. Seed 20261001 everywhere.
Parent: `docs/pre-registration-fly-v0.md` / `-castv2.md`. v1/v2 receipts stay FAIL — this is a new experiment, no goalpost move.

## 0. Why (autopsy-grounded, from tools/cast_diag.js on the fly-stack-v0 tree)

CAST v2 sealed FAIL with delta 0. The 4 zero-evidence failures are NOT search-policy
failures — every one is a matching-layer/vocab gap in `edge/nl_route.js`:

| id   | degraded prompt                | gold    | gap                                                                 |
|------|--------------------------------|---------|---------------------------------------------------------------------|
| wc05 | `blok print texture`           | woodcut | `blok`~`block` is edit-1, but fuzzy-1 applies to SINGLE-WORD terms only; `block` exists only inside multi-word term `block print`. Zero hits. |
| sf10 | `cottoo-wnol atmohpsere`       | soft    | `cotton-wool` corrupted by an adjacent swap = edit-2 in plain Levenshtein (transposition not counted as 1); hyphenated token not decomposable. `atmosphere` not in graph. Zero hits. |
| hr08 | `hrad`                         | harsh   | `hrad`→`hard` is an ADJACENT TRANSPOSITION = Levenshtein 2, editDistance1() rejects. Zero hits. |
| un07 | `brutalist razor edge contrast`| harsh   | `brutal`∈graph but `brutalist` is a suffix extension (edit 3); `contrast`∈`high contrast` multi-word only; `razor` not in graph. Zero hits. |

Constraint class (v1 measurement): synonym-graph VOCAB COVERAGE is binding, not
search policy (cast_eval_v2_receipt.json: fallback fires, delta still 0).

## 1. v3 mechanism (four pre-registered layers, applied inside the CAST widened view AND the zero-evidence fallback path; canonical narrow view untouched)

L1 **Transposition-aware edit distance** (Damerau-Levenshtein with adjacent-swap cost 1,
otherwise plain Levenshtein) replaces `editDistance1` for the fuzzy pass. Max distance
stays 1 for single words. Pins: `hrad`~`hard` HIT; `word`~`hard` MISS (negative control).

L2 **Constituent fuzzy on multi-word terms**: a multi-word term matches when ≥60% of
its words fuzzy-match (each word independently, transposition-aware) and the matched
words appear in prompt order. Whole-phrase exact match unchanged. Pins: `blok print`~`block print` HIT; `print blok` MISS (order guard); `print zzzz` MISS (60% guard: 1/2 < 60%).

L3 **Hyphen/underscore normalization**: hyphens and underscores in BOTH prompt tokens
and graph terms are treated as word separators before matching (so `cottoo-wnol` →
`cottoo wnol` → fuzzy vs `cotton wool`). Exact-match pass unaffected. Pin: `cotton-wool`
clean hit still exact (not double-counted).

L4 **Pre-registered vocab additions (weak weight only, this list is closed)**:
- `atmosphere`, `atmospheric` → soft (weak)
- `razor`, `razor-sharp` → harsh (weak)
- `relief`, `ink` → woodcut (weak)

Rationale for weak-only: strong/medium band moves are a different experiment
(threshold sensitivity); weak hits must still clear `route_threshold` 1.0 to route,
so they cannot hijack a prompt that already carries evidence.

## 2. Suite (unchanged, pinned)

- Degraded suite: seeded corruption of the pinned 50 + 8 unseen rewrites,
  seed 20261001, exactly `tools/cast_route.js` generation logic.
- Clean suite: `edge/eval_prompts.json` 50/50.
- Parity: `tools/nl_parity.mjs` 7 pins must stay green (canonical core ≡ reference).

## 3. Hypotheses (measured on the sealed suite; no tuning after first receipt)

- **H1 recover**: v3 routes ≥3 of the 4 zero-evidence failures correctly (wc05, sf10, hr08, un07).
- **H2 zero regression (clean)**: clean top-1 stays 50/50; per-class score deltas vs v2 baseline ≤ 0.1 on every clean prompt.
- **H3 no over-firing**: mean candidate classes per clean prompt ≤ baseline + 0.5 (v2 baseline measured in the same receipt run).
- **H4 parity**: nl_parity.mjs 7/7 green; FAIL-first expectation: on the pre-v3 tree the 3 new L1/L2 pins are RED (hrad miss, blok print miss, order-guard false-positive) — sealed before run.

## 4. Kill criteria (R8)

- Any clean-suite regression (H2 fail) → v3 sealed FAIL, layers L1–L4 NOT merged into
  canonical `edge/nl_route.js`; receipt documents which layer caused it.
- Fallback-path fire count on degraded > 2x v2's (v2: 9) → H3-style over-firing,
  sealed FAIL for L4, L1–L3 re-evaluated separately.

## 5. Honest limits (pre-written)

n=58 degraded prompts; 4 failures is a small denominator — H1 is a recovery claim,
not a coverage claim. The 50-prompt clean suite was used to build v1/v2; delta
numbers on it are optimistic (shared lineage). L4 vocab is hand-picked from exactly
the 4 failures (post-hoc vocabulary) — it is pre-registered here, but the honest
generalization test is a FRESH unseen-phrasing set, to be written before any v4.
