# Pre-registration — geometric-PN KC layer v4 (cone-math correction of the sealed v3)

**Sealed BEFORE any run (R1).** This is a NEW experiment replacing the failed v3 run
(`tools/kc_geo_receipt.json`, verdict FAIL per R8, commit a21e1e5). Both prior FAILs
stand unchanged — no goalpost move:

- v0 KC layer sealed FAIL (5-fold 0.26 < dense null 0.40, interference −41 pts).
- v3 geometric-PN sealed FAIL: H1 0.88 < 0.90, H2 0.4483 < router 0.931,
  H3 41.2-pt drop > 5 pts, H4 shuffle 0.76 > 0.40 ceiling.

## The spec bug being corrected (motivation, measured not assumed)

v3 fixed `ρ = tan(30°) = 0.5774` claiming an analytic guarantee that *every term lies
within a 30° cone of its class prototype*. That claim is FALSE. For
`point = normalize(u + ρ·ε)` with unit u, unit ε, the angle θ to u satisfies

    sin²θ = ρ²(1 − t²) / (1 + ρ² + 2ρt),   t = cos(u, ε) ∈ [−1, 1]

which is maximized at t = −ρ, giving **sin θ_max = ρ** (for ρ ≤ 1). So the true
analytic worst case at ρ = tan 30° is **arcsin(tan 30°) = 35.264°**, not 30°.
The v3 run measured max deviation **33.763°** — inside the true bound, outside the
claimed one. G2 failed on the false claim, not on a geometry defect.

v4 sets **ρ = sin(30°) = 0.5**, for which the analytic worst case is exactly
**arcsin(0.5) = 30.000°** (attained at cos(u, ε) = −0.5, the anti-aligned noise
component). The 30° cone claim becomes true by construction.

## Construction delta vs sealed v3 — ONE constant, everything else frozen

Same document as `docs/pre-registration-geopn-kc.md` (v3) applies verbatim
(prototypes = first 4 columns of QR-orthonormalized 64×64 Gaussian, seed 20261001;
matcher rules and band weights from `edge/nl_route.js`; PN = L2-normalize(Σ w·point);
KC seeded projection 64→2048 ~10% density seed 20261001 **byte-identical draw**;
WTA top-102; MBON init 1.0; depression-only ×0.8; locality ≤102 rows; zero-hit →
zero vector → `default`, asserted identical to v0 default path), with:

1. `ρ = 0.5` (was `tan(30°) = 0.5774`). This is the ONLY code delta in
   `tools/kc_geo.py`.
2. G2 pin corrected to its honest form: max term deviation ≤ **30.5°** sampling
   margin over the **true** analytic bound 30.000°, and the receipt must record
   both the measured max and the analytic bound (35.264° for the v3 constant,
   30.000° for v4) so the claim-bug stays pinned in the receipt.

## Hypotheses and pass bars — UNCHANGED from v3 (no goalpost move)

- **H1**: 5-fold seeded CV over the clean 50 mean top-1 **≥ 0.90**.
- **H2**: zero-shot degraded-58 **≥ router-on-degraded** (router 0.931 as measured
  in `tools/cast_eval_receipt.json`).
- **H3**: interference drop **≤ 5 pts** (same trio protocol).
- **H4**: geometry-shuffle control 5-fold **≤ 0.40**; if shuffle ≈ unshuffled the
  result is FAIL regardless of H1.
- Nulls unchanged: chance + dense-linear readout on the 64-dim PN-geo vector.

## Honest trade-off hypothesis (why v4 is worth one run)

Halving ρ tightens class cones: within-class cosine spread shrinks (v3 measured
within−between +0.7998 at ρ=0.5774), so H4's shuffle separation should IMPROVE
(shuffled points move further from any correct prototype relative to class
tightness), while per-term discriminability inside a class shrinks, pressuring H1.
v3 failed every bar with a falsely loose cone; v4 tests whether the *honest* cone
changes the verdict. Either outcome is informative; a third spec revision after
this run requires new evidence, not new constants (R8).

## Receipt

`tools/kc_geo_v4_receipt.json`: seed, ρ, analytic bound (deg), measured max
deviation (deg), G1/G3 (unchanged pins), G2 (corrected pin), per-fold scores,
shuffle-control scores, nulls, fnv1a-64 decision chain, verdict per hypothesis,
hashes of the sealed v3 spec and v3 FAIL receipt it replaces. Receipt schema fixed
here; no fields added after the run.

## Kill criterion

R8: no signal after 15 min of work → stop, write a negative receipt naming which
hypothesis died and where. Any H-pass that required changing a rule in this
document (or in the sealed v3 doc it inherits) is a FAIL, not a pass.
