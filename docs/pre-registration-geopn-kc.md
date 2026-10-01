# Pre-registration — geometric-PN KC layer (rebuild of build 4.2)

**Sealed BEFORE any run (R1).** This is a NEW experiment replacing the failed build 4.2.
The sealed FAIL of `tools/kc_layer_receipt.json` (5-fold 0.26 < dense null 0.40) stands
unchanged — no goalpost move. Hypothesis source: fly-stack v0 commit 36a9e47 autopsy
(`tools/cast_diag.js`): random-expansion KC **preserves term- not class-level locality**
in discrete synonym space. Proposed fix: make the PN geometry itself class-aware
(glomerular-map analog — neighboring PN responses mean similar odors), then keep the
KC/MBON machinery byte-identical to the failed run so the comparison isolates the
encoding.

Branch: `geopn-kc-pre-registration` (off `fly-stack-v0`). Seed for all stochastic draws:
**20261001** (same as v0). Canonical classes: `woodcut, terminal, soft, harsh` (+ `default`,
which is the zero-hit class and owns no prototype).

---

## Construction (all rules fixed here, before any measurement)

### 1. Geometric PN encoding (tools/kc_geo.py, replaces the ~200-dim term-index PN vector)

- Fixed frame `D_GEO = 64`. Class prototypes `u_c` (c ∈ 4 classes) = first 4 columns of
  a QR-orthonormalized 64×64 Gaussian draw, RNG seed 20261001. Prototypes are
  orthonormal: cos(u_c, u_d) = 0 for c ≠ d.
- Term embedding: `point(term) = normalize(u_cls(term) + ρ·ε(term))` where
  `ε(term)` = unit noise from mulberry32 keyed on fnv1a-64(term string), and
  `ρ = tan(30°)` so **every term lies within a 30° cone of its class prototype**
  (bound is analytic, not sampled).
- PN response: same matcher rules as `edge/nl_route.js` (phrase / word / fuzzy-1,
  band weights strong 2.0 / medium 1.5 / weak 1.0 taken from the graph config at run
  time). `PN(x) = L2-normalize(Σ matched terms w_i · point(term_i))`. Zero hits →
  zero vector (routes to `default`); zero-hit behavior is asserted identical to the
  v0 KC layer's default path.

### 2. KC + MBON machinery — UNCHANGED from kc_layer.py

- Seeded random projection 64→2048 (PN→KC synapses, ~10% density, RNG seed 20261001).
  **Same draw algorithm and density as the failed run** — the only delta entering the
  projection is the 64-dim geometric PN vector instead of the ~200-dim term vector.
- WTA top-102 (5%); MBON per-class readout init 1.0; DEPRESSION-ONLY plasticity
  (mistake → `W[pred][active] *= 0.8`, correct → no write); locality pin ≤102 rows.

### 3. Pre-training geometry receipt (no learning involved — pins the mechanism exists)

- G1: cos(u_c, u_d) == 0 exactly (orthonormal frame, float tolerance 1e-9).
- G2: max over all graph terms of angular deviation from own class prototype ≤ 30.5°
  (sampling margin over the analytic bound).
- G3: mean pairwise cosine of term points **within** a class > mean **between** classes
  + 0.5.

## Hypotheses and pass bars

- **H1**: 5-fold seeded CV over the clean 50 (`edge/eval_prompts.json`, same folds as
  v0 receipt) mean top-1 **≥ 0.90**.
- **H2**: zero-shot on the degraded 58-prompt suite (`tools/cast_suite.json`) after
  training once on all 50 clean: **≥ router-on-degraded** (router degraded top-1 as
  measured in `tools/cast_eval_receipt.json`).
- **H3**: interference — train trio {woodcut, terminal, soft} → train {harsh} → retest
  trio: accuracy drop **≤ 5 points** (synaptic-freezing property, same protocol as v0).
- **H4 (mechanism pin, the discriminating test)**: **geometry-shuffle control** —
  reassign every term point to the WRONG prototype (class index +1 mod 4, deterministic
  rotation), keep projection seed, KC/MBON code, and all training identical. Pass bar:
  shuffled 5-fold mean **≤ 0.40** (dense-null ceiling from the sealed v0 receipt). If
  shuffled ≈ unshuffled, the geometry is not doing the work and the result is a FAIL
  regardless of H1.
- Nulls (same updates as main arms): chance baseline + dense-linear readout on the
  64-dim PN-geo vector (no expansion).

## Receipt

`tools/kc_geo_receipt.json`: seed, prototype-frame hash, G1–G3 measurements, per-fold
scores, shuffle-control scores, nulls, fnv1a-64 chain over all prompt–ψ/label decisions,
verdict per hypothesis, and the sealed-v0 FAIL receipt hash it is compared against.
Receipt schema fields fixed here; no fields added after the run.

## Kill criterion

R8: no signal after 15 min of work → stop, write a negative receipt naming which
hypothesis died and where, stack proceeds without it. Any H-pass that required changing
a rule in this document is a FAIL, not a pass.
