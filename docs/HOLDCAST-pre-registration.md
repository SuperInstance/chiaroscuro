# JEV v2 — HOLD/CAST abstention split — pre-registration (R1/R3)

**Sealed BEFORE any measurement. Date:** 2026-10-01, chiaroscuro branch jev-v2-holdcast.
**Source:** docs/FRUITFLY-JEV-MOTH.md §3/§4.3 — the fly's evidence-absence response is
bimodal (darkness straight-flight HOLD vs odor-OFF casting). JEV Abstain is monolithic.

## Hypothesis + direction

H1: Splitting Abstain into HOLD vs CAST, where CAST widens the candidate intent set
(synonym neighbors at edit distance ≤2 enter scoring at weight ×0.5), recovers
**≥10 points top-1** on a degraded prompt suite (typo distance-2, unseen phrasings)
relative to the v1 router, on the same graph, with no graph edits.

H2 (cost guard): on the clean pinned 50-prompt suite, v2 top-1 stays **50/50** and
wall-clock overhead is **≤5%** (CAST should not fire on clean, well-matched prompts).

H3 (gate): the jev_gate.js abstain-mode register classifies Abstain frames as HOLD
except when (a) the cell's last nonzero ψ was −1 (rejection just happened) or
(b) the running belief amplitude (EMA of evidence, decay 0.9/frame) is below floor
0.10 — then CAST. CAST is capped at **1 per cell per 16-frame window**; every CAST
is counted and receipted.

## Exact metric, dataset, pass bar (fixed NOW)

- Degraded suite: `edge/degraded_prompts.json`, 100 prompts = 2 deterministic seeded
  degradations of each of the 50 clean prompts (degrade seed 20261001; generator
  committed before the run; distance-2 typos + function-word dropout).
- Metric: top-1 accuracy vs `label_class`, identical scoring code path for v1/v2
  (v2 = CAST-widened, single widening pass max, pre-registered).
- Pass bars (commit/kill, sealed): H1 ≥ +0.10 absolute top-1 on degraded; H2 clean
  50/50 AND ≤1.05× wall clock; H3 gate self-test pins green.

## Null control

v1 router (current nl_route.js semantics, CAST disabled) scored on the identical
degraded suite in the same process run — difference isolates CAST, not drift.

## Receipts

- `tools/holdcast_ab_receipt.json` — clean + degraded top-1 v1/v2, wall clocks,
  cast counts, degrade-seed, input file sha256s, verdict per hypothesis.
- Gate counters ride the A/B runner output (holds/casts per scenario).

## Kill criterion (R8)

15 min no-signal → stop, write negative receipt. CAST thrash guard: if CAST flips
any clean-suite route, H2 fails and CAST ships disabled behind `cast:false` default.

## Revision 1 (sealed AFTER first run, BEFORE any re-run — diagnosis-driven)

First receipt (verdict FAIL, preserved in git history): v1 already scores 0.870 on
the degraded suite; 12 of 13 residual failures have **zero matched terms**
(distance-2 typos destroy fuzzy-1) — CAST as registered could not fire because it
required ≥1 hit. The fly analog casts precisely when the plume is absent, not
when it is merely weak.

Revised trigger, sealed now: CAST fires whenever best === null (evidence absence),
whether or not hits exist. Widening: every prompt word of length ≥
fuzzy_min_term_len is matched against ALL single-word graph terms at edit
distance ≤2 (hits present: bases = matched-term roots only, per original spec;
no hits: bases = all prompt words). Neighbor weight = term weight × 0.5
(pre-registered factor unchanged; only strong-band neighbors can reach
route_threshold=1.0 — an honest, testable consequence). Single widening pass,
tiebreak rule unchanged. All other bars (H1 ≥ +0.10, H2 clean 50/50 ≤5% clock,
H3 pins) unchanged. H1-rev is tested against the SAME seeded degraded suite.
