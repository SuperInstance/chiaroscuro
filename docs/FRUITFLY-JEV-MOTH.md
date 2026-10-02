# FRUITFLY × JEV × MOTH — Deep Research Synthesis

**Status:** research synthesis + build ideation (no new measurements in this doc)
**Date:** 2026-10-01
**Claims discipline:** every load-bearing claim tagged **[FOUND]** (literature-grounded this session), **[INFERRED]** (my synthesis/analogy), or **[NOT FOUND]** (checked, absent). Build proposals are ideation until pre-registered and run.
**Why this doc exists:** user asked for (1) what is known about fruit fly behavior outside CS, (2) the computer representations of it, (3) ideation on how this becomes a powerful tool with JEV (chiaroscuro ternary gate) and Moth (MicroMoth-quilt quantum receipts).

---

## 1. What the fly is actually known to do (ethology canon)

### 1.1 Stabilization reflexes — the "always-on" layer
- **Optomotor response** [FOUND]: whole-field motion → syndirectional torque. Characterized tethered (Götz 1975; Straw 2010 reviews). Gain is matched to what the fly can track — a reflex with a built-in deadband, not a naive proportional controller.
- **Stripe fixation vs sun menotaxis are DIFFERENT behaviors** [FOUND, Giraldo et al. 2018]: a fly fixates a wide dark stripe frontally (near-object reflex) but adopts an ARBITRARY heading relative to a small bright spot (sun) and remembers that heading across flights, even over hours. Silencing E-PG compass neurons abolishes menotaxis and reverts the fly to frontal phototaxis — i.e., removing the belief circuit doesn't remove reflexes; it reveals the simpler layer underneath. Two flight modes: short-range reflex vs long-range dispersal navigation.
- **Altitude control** [FOUND, Straw 2010]: three stacked reflexes (horizontal-edge set point, wide-field syndirectional response, ventral-expansion avoidance). Steering and altitude reflexes are parallel, homologous algorithms.
- **Polarized-light orientation** [FOUND, Weir & Dickinson 2012]: flies hold straighter courses under natural skylight polarization; a 90° rotation of the pattern rotates their heading. Drosophila does NOT have a time-compensated sun compass [FOUND, Warren et al. 2024, JEB] — a recent negative result worth respecting: the compass is idiothetic+celestial, not ephemeris-based.

### 1.2 Navigation — the belief layer
- **Ring-attractor compass** [FOUND]: E-PG neurons in the ellipsoid body hold a single "bump" of activity whose position encodes heading. Bump tracks voluntary turns (head-fixed flight, up to 10s faithful maintenance between saccades — Currea et al. 2026 PNAS preprint). Bump-to-stimulus offset is idiosyncratic per fly and does NOT encode heading preference (Giraldo 2018).
- **Path integration** [FOUND]: P-EN neurons shift the bump by angular velocity (Turner-Evans et al. 2017, eLife); this is idiothetic update. In darkness, flies maintain headings from self-motion alone.
- **Menotaxis is the observable signature of a belief**: arbitrary but persistent heading + inter-individual variation + hours-long retention.

### 1.3 Search — the evidence-seeking layer
- **Cast-and-surge plume tracking** [FOUND, van Breugel & Dickinson 2014, Curr Biol]: within ~200 ms of odor onset, flying flies surge upwind; 400–800 ms after odor loss, they cast crosswind. Behavior is a chain of sensorimotor reflexes, not a map — EXCEPT when evidence demands more.
- **Odor-specific persistence hallucination** [FOUND, Krishnan et al. 2011]: after a TRUNCATED ethyl-butyrate plume, flies kept tracking as if the plume were still there for 25 s (not for vinegar/banana) — the neural representation outlasts the stimulus, and the fly orients in the total absence of a spatial gradient. This is a working-memory-driven belief overriding direct evidence — or rather, replacing absent evidence with a maintained prior.
- **Odor-OFF → local search** [FOUND, Nagel et al. via infotaxis literature]: upwind run on ON response, local search on OFF. Absence of odor is treated as INFORMATION (cf. infotaxis: Vergassola, Villermaux & Shraiman 2007, Nature — searching by maximizing information gain when gradients don't exist).
- **Infotaxis is the normative model** [FOUND]: flies' ON/OFF responses match infotaxis-like information-seeking; absence-of-signal updates the source-location belief.
- **Looming escape + anti-tracking** [FOUND, Card & Dickinson 2008; Wasserman et al. 2012]: expansion-triggered escape is visually pre-planned (motor planning ~ before takeoff); aversive odor is actively anti-tracked (dynamic avoidance, not ballistic escape).

### 1.4 Learning and valence — the memory layer
- **Mushroom body sparse code** [FOUND]: ~50 antennal-lobe projection neurons → ~2000 Kenyon cells; ~5% KCs active per odor (winner-take-all enforced by APL/GABA feedback). Sparse, non-stereotyped, high-capacity.
- **Dopamine writes valence** [FOUND, Aso et al. 2014; Takemura et al. 2017]: 20 DAN types × 21 MBON types form 15–16 compartments. DAN activity induces enduring DEPRESSION of KC→MBON synapses that were active at dopamine time. Reward DANs and punishment DANs are segregated (horizontal vs vertical lobes). Valence = which compartment got dopamine; identity = which KCs were on.
- **Depression-only, temporally sparse plasticity = online LDA** [FOUND, Lipshutz et al. 2023]: the MBON is well-modeled as a linear discriminant; DAN-sparse depression-only updates derived from an LDA objective reproduce the biology. This is a big deal for us (§4.3).
- **Associative induction is sufficient, not just necessary** [FOUND, Vasmer et al. 2014]: thermogenetically activating random KC ensembles coincident with an aversive stimulus induces real avoidance memory. The KC code IS the CS representation.
- **Compensatory variability** [FOUND, PNAS 2021]: realistic KC parameter variability degrades memory unless parameters compensate to equalize KC average activity; the predicted correlations appear in the hemibrain connectome. Homeostatic receipt-checking, in effect.
- **Continual learning without forgetting** [FOUND, Dasgupta/Navlakha line]: sparse expansion + synaptic freezing of inactive synapses gives locality → new memories don't overwrite old ones.

### 1.5 The connectome substrate
- **Larva fully mapped** [FOUND, Winding et al. 2023 Science]: 3,016 neurons, >500k synapses; MB module PN→KC→MBON is the canonical decision circuit.
- **Adult hemibrain + FlyWire** [FOUND]: adult MB connectomes at synaptic resolution (Takemura 2017 α-lobe: 983 neurons; FlyWire whole-brain community resource). The point for us: every claimed circuit motif above has a checkable wiring diagram.

**Section 1 takeaway:** the fly runs a layered stack — reflexes (always-on, deadbanded) → belief (ring attractor, vector-valued) → search (cast/surge, absence-as-information) → memory (sparse expansion, dopamine-gated depression-only writes). Each layer has experimentally isolatable signatures and known circuit motifs.

---

## 2. How computer science represents this

- **Ring attractor models** [FOUND]: continuous attractor neural networks reproduce bump dynamics; the 2021 bioRxiv circKF paper frames the CX as a CIRCULAR KALMAN FILTER — the bump is a belief VECTOR (position = heading, amplitude = certainty), P-ENs are process updates, visual/touch inputs are measurement updates with gains. Quote-level finding: *"absolute heading observations that are in conflict with the current belief result in a shortening of the belief vector"* — the circuit does not jump on conflicting evidence; it deflates certainty and keeps the prior's direction.
- **Infotaxis** [FOUND]: belief over source location + entropy-gradient motion planning; the canonical "search when gradients don't exist" algorithm.
- **MB as random-expansion classifier** [FOUND]: PN→KC as random projection + WTA sparsifier; KC→MBON as linear readout trained by dopamine-gated depression; normative derivations (LDA) and reservoir-style analyses exist.
- **Neuromorphic fly vision** [FOUND as a field]: event-based optic flow chips derived from Hassenstein–Reichardt correlators (T4/T5 analogs) are a mature subfield. (Textbook; specific chip citations not re-verified this session — verify before external citation.)
- **What CS does NOT have** [INFERRED]: a ternary EVIDENCE-EVALUATION formalism at the cue level. Models assume measurement-update rules (Kalman gains, fixed learning rates) rather than per-cue commit/reject/abstain decisions. The fly behavior literature, though, is full of ternary structure: surge (commit to upwind), cast (reject the current heading hypothesis, explore), hold (abstain: maintain course from working memory). Nobody seems to have written the JEV-shaped bridge. That gap is our opening.

---

## 3. The JEV ↔ fly mapping (the core ideation)

JEV today: per-cue ternary gate ψ ∈ {−1 Reject, 0 Abstain, +1 Commit} with thresholds TAU_MOTION=0.35 / TAU_STATIC=0.05, a lifecycle FSM, and dirty-flag dispatch-skip. Fly evidence:

| Fly mechanism | Observed behavior | JEV element | Mapping strength |
|---|---|---|---|
| E-PG bump re-anchored by landmark (consistent cue) | menotaxis holds arbitrary heading persistently | Commit ψ=+1 (cue updates belief) | STRONG [FOUND+INFERRED] |
| circKF: conflicting landmark → belief vector SHORTENS, no jump | cue dismissed, certainty drops, direction kept | Reject ψ=−1 (cue rejected, belief preserved with reduced confidence) | STRONG — near-literal [FOUND quote + INFERRED bridge] |
| E-PG holds heading up to 10 s in darkness / between saccades | straight flight between turns, no external cue | Abstain ψ=0 (keep prior tokens resident, no dispatch) | STRONG [FOUND + INFERRED] |
| Odor-OFF → cast: crosswind turns, increased turn rate | absence of evidence triggers STRUCTURED EXPLORATION, not freezing | **JEV v2 proposal: Abstain has two modes — HOLD vs CAST** | INFERRED (novel for JEV) |
| Surge within 200 ms of whiff | fast commit on high-confidence evidence | TAU_MOTION (low threshold when signal moving) | ANALOGY [INFERRED] |
| KC sparse expansion 50→2000, ~5% WTA | odor identity as sparse high-dim code | ATLAS 24-bit glyph codes → KC layer expansion (§4.2) | STRONG structural [FOUND + INFERRED] |
| DAN-gated depression-only KC→MBON plasticity | valence written only onto synapses active at reward/punish time | eval-driven, locality-respecting weight update (only active rows touched) | STRONG — and normatively LDA [FOUND] |
| Synaptic freezing (inactive synapses untouched) | continual learning without catastrophic forgetting | wallet-sketch "locality" requirement | STRONG [FOUND + INFERRED] |
| APL feedback enforcing ~5% sparsity | homeostatic gain control | codebook population control (token budget) | ANALOGY [INFERRED] |
| Compensatory KC variability preserving mean activity | robust memory despite component noise | receipts-over-claims drift audit / homeostatic re-calibration | ANALOGY [INFERRED] |

**The single most valuable idea in this doc (INFERRED, novel): JEV's Abstain is monolithic; the fly's evidence-absence response is bimodal.** When evidence is merely absent but belief confidence is high, the fly holds course (darkness straight flight). When evidence was EXPECTED and is missing, or a cue was just rejected, the fly casts — it increases turn rate and samples alternatives (odor-OFF → local search; conflict → belief deflation then re-sampling). JEV v2: ψ=0 splits into HOLD vs CAST by a confidence register: CAST when (a) last nonzero ψ was −1 (rejection just happened), or (b) belief amplitude (a running agreement/decay statistic) below a pre-registered floor. CAST = expand the active candidate set (in the NL router: also evaluate synonym-neighbor intents; in glyph election: widen the Hamming radius). This is a falsifiable, receiptable upgrade.

---

## 4. Build proposals (smallest-first-build, all pre-registration-ready)

### 4.1 flycx v0 — ring-attractor heading integrator with JEV ternary cue gating
- **What exists:** circKF models, E-PG/P-EN/Delta7 motifs, our tools/jev_gate.py.
- **What's missing:** a seeded, receipted ring-attractor sim where each external cue passes a JEV gate; conflicting cues shorten amplitude instead of moving the bump.
- **Smallest first build (one evening):** `tools/fly_cx.py` in chiaroscuro — 16-bin ring, P-EN-style angular-velocity integration, cue events as (angle, confidence) pairs through jev_gate.js thresholds; conflicting cue → amplitude ×0.7, no shift; receipt: bump trajectory hash + per-cue ψ log. Pre-registered tests: (T1) no cues → bump drifts <5°/s; (T2) consistent cue → bump converges to cue angle; (T3) 180°-conflicting cue → amplitude drops ≥30%, position displacement <15°; (T4) dark-hold → 10s maintenance (mirrors fly). This is the "fruit fly commits/rejects/abstains" demonstrator.
- **Value:** turns the JEV gate from a filter into a belief-state controller with a published-animal behavior target to match.

### 4.2 KC layer over the ATLAS codebook — sparse expansion + fly-plasticity router learning
- **What exists:** 70-glyph 24-bit atlas (atlas-forge v0, already swapped into chiaroscuro), 50-prompt NL eval at 1.000 top-1 (edge NL router), MB literature with LDA-equivalent depression-only rule.
- **What's missing:** the random-expansion layer between glyph codes and intent readout, trained with DAN-style gated updates.
- **Smallest first build:** `tools/kc_layer.py` — 24-bit dense code → random projection (seeded; **optionally quantum-seeded from a MicroMoth-quilt collapse receipt via the quantumSeed/quantumField plugin — "KC wiring rolled by quantum dice, every roll receipted"**) → 512 KCs, 5% WTA → one MBON per intent class → depression-only updates gated by eval outcome, active-KC-only locality. Pre-registered comparison: KC-layer classifier vs current synonym-graph router on the same 50-prompt eval + a held-out 50 — hypothesis: KC layer matches top-1 on seen and degrades less on unseen (sparse codes generalize; literature-grounded). Also measure interference: learn 2nd intent set, re-test 1st (catastrophic forgetting metric — the fly passes this by freezing).
- **Value:** replaces hand-built synonym graphs with a biologically-normative learner that keeps receipts; the quantum-seeded wiring is a genuine Moth tie-in, not decoration.

### 4.3 JEV v2 — HOLD/CAST abstention split
- **What exists:** jev_gate.js with static TAU thresholds; dirty-flag dispatch skip.
- **What's missing:** confidence register + CAST behavior (structured exploration on evidence-absence).
- **Smallest first build:** extend jev_gate.js with an `abstain_mode` output; wire the NL router so CAST widens candidate intent sets (synonym neighbors at Hamming 1–2). Pre-registered A/B on a degraded-prompt suite (typos, unseen phrasings): hypothesis CAST recovers ≥10 points top-1 on degraded inputs at ≤5% latency cost on clean inputs.
- **Risk:** CAST could thrash; cap casts per session, receipt every cast.

### 4.4 Moth cells as belief-state notaries (MicroMoth-quilt)
- **What exists:** BIND/LINK/EFFECT/VIEW/TICK + FORGET/PROOF opcodes, fnv1a-64 chained receipts, cell-ledger, PROOF statevector witness cells, verified Bell-state output; qcells sibling gate for experiment cells.
- **What's missing:** any cell that seals CLASSICAL dynamics trajectories.
- **Smallest first build:** a `FLYCX-TICK` cell family — seal flycx bump trajectories (§4.1) as LINKed ticks; a PROOF cell wraps the run (seed, trajectory hash, per-cue ψ log hash). Deliberately classical-content/quantum-discipline: the receipt chain is the product. Honest framing: at 70 glyphs, quantum counting/Grover has NO classical advantage — the value is (a) receipts, (b) the teaching scaffold, (c) if the codebook ever scales toward 2^24, BBHT counting of "codes within Hamming r of probe" becomes a real quadratic story worth re-opening.
- **Ideation flag (NOT FOUND as biology):** any actual quantum-biology claim about fly cognition is NOT FOUND and should not be implied. The bridge is architectural, not physical.

### 4.5 Sobel-as-optic-flow (chiaroscuro native)
- T4/T5-style orientation-energy descriptors ↔ js/sobel_shape.js are the same computational family (orientation-selective filters driving stabilization) [INFERRED analogy, textbook-side]. Pre-registered experiment: feed Sobel descriptor streams as angular-velocity input to flycx (§4.1) and test whether the bump stabilizes a rendered glyph's apparent rotation — closing a loop: glyph code → render → Sobel flow → ring attractor → ψ-gated cue back to the election. That's a fly-complete sensorimotor loop inside chiaroscuro, all receipted.
- This one is the "wow" demo: the engine literally behaves like a fly looking at a stripe.

---

## 5. Pre-registration templates (ready to seal before any build)

Shared skeleton (R1/R3-compliant), per build:
1. Hypothesis + direction + why (cite §1–§3 tags).
2. Exact metric, dataset/seed, pass bar — fixed BEFORE running.
3. Null control (random projection / frozen gate) run side-by-side.
4. Receipts: output JSON with seed, hashes, per-decision logs; commit message carries the verdict per repo convention (receipts/ is gitignored in chiaroscuro; content rides commits).
5. Kill criterion (R8): 15 min no-signal → stop, write negative receipt.

Suggested order by value×feasibility: **4.1 flycx v0** (one evening, unlocks everything) → **4.3 HOLD/CAST** (small diff, direct eval uplift) → **4.2 KC layer** (bigger, but the LDA-equivalence makes it principled) → **4.4 Moth notary** (cheap, ties fleet) → **4.5 optic-flow loop** (the demo).

---

## 6. Honesty ledger

- **[FOUND]** everything in §1 and §2 marked so; grounded via literature search this session (Giraldo 2018; Weir & Dickinson 2012; Warren et al. 2024; Turner-Evans 2017; van Breugel & Dickinson 2014; Krishnan 2011; Aso 2014; Takemura 2017; Lipshutz 2023; Vasmer 2014; Winding 2023; circKF bioRxiv 2021; Vergassola 2007; PNAS 2021 compensatory variability).
- **[INFERRED]** all JEV/Moth/ATLAS mappings in §3–§4 — design analogies, not established science. The HOLD/CAST split is my novel synthesis of odor-OFF casting + darkness-holding; publishable as engineering, not as neuroscience.
- **[NOT FOUND]** (a) time-compensated sun compass in Drosophila — absent (Warren 2024 negative); (b) any quantum-biological mechanism in fly cognition — absent; do not claim; (c) an existing ternary per-cue evidence gate in the CX modeling literature — not found this session (gap claim is soft: absence of evidence after one search pass, not exhaustive).
- **Session limits:** single-pass searches; specific neuromorphic chip citations and hemibrain/FlyWire volume numbers not re-verified line-by-line — verify before quoting in anything external.
