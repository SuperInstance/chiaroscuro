#!/usr/bin/env python3
"""
kc_geo.py — geometric-PN KC layer (rebuild of failed build 4.2).
Pre-registered in docs/pre-registration-geopn-kc.md (SEALED BEFORE any run, R1).
The sealed FAIL of tools/kc_layer_receipt.json (5-fold 0.26 < dense null 0.40)
stands unchanged — no goalpost move.

Delta vs kc_layer.py: ONLY the PN encoding. KC projection draw algorithm,
density (~10%), WTA top-102, MBON init, depression-only plasticity, locality
pin — all byte-identical (imported KCModel). The 64-dim geometric PN vector
replaces the ~200-dim term-index PN vector so class similarity is geometric
(30-degree class cones around QR-orthonormal prototypes) before MB expansion.

Tests (bars from the sealed spec):
  G1-G3  pre-training geometry pins (mechanism exists, no learning)
  H1     5-fold seeded CV clean 50, mean top-1 >= 0.90
  H2     zero-shot degraded 58 >= router-on-degraded (0.931)
  H3     interference trio->harsh->trio drop <= 5 pts
  H4     geometry-shuffle control: wrong-prototype rotation, 5-fold <= 0.40;
         if shuffled ~= unshuffled -> FAIL regardless of H1 (mechanism pin)
  Nulls  chance 0.20 + dense-linear readout on the 64-dim geo PN vector
Seed 20261001 everywhere (same as v0).
"""
import json, os, random, re, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kc_layer import (KCModel, CLASSES, load_graph, NEG_MARKERS,
                      edit_distance_1)

SEED = 20261001
D_GEO = 64
RHO = 0.5  # sin(30deg) — v4 correction: analytic worst case arcsin(rho)=30.000deg exactly
GEO_CLASSES = ["woodcut", "terminal", "soft", "harsh"]  # default owns no prototype
HERE = os.path.dirname(os.path.abspath(__file__))


def fnv1a_64(s):
    h = 0xcbf29ce484222325
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x100000001b3) & 0xffffffffffffffff
    return h


def _imul(a, b):
    return ((a & 0xffffffff) * (b & 0xffffffff)) & 0xffffffff


def mulberry32_stream(seed):
    """Faithful port of the JS mulberry32 PRNG (deterministic unit noise)."""
    a = seed & 0xffffffff
    while True:
        a = (a + 0x6D2B79F5) & 0xffffffff
        t = a
        t = _imul(t ^ (t >> 15), t | 1)
        t = (t ^ ((t + _imul(t ^ (t >> 7), t | 61)) & 0xffffffff)) & 0xffffffff
        yield ((t ^ (t >> 14)) & 0xffffffff) / 4294967296.0


def unit_noise(term):
    stream = mulberry32_stream(fnv1a_64(term))
    v = np.array([next(stream) for _ in range(D_GEO)], dtype=np.float64)
    n = np.linalg.norm(v)
    return v / n if n > 0 else v


def prototype_frame():
    """First 4 columns of a QR-orthonormalized 64x64 Gaussian draw, seed 20261001."""
    rng = np.random.default_rng(SEED)
    gauss = rng.standard_normal((D_GEO, D_GEO))
    q, _ = np.linalg.qr(gauss)
    return q[:, :4]  # u_woodcut, u_terminal, u_soft, u_harsh — orthonormal


def make_point_map(graph, flat, frame, shuffle=False):
    """term -> 64-dim point. shuffle: class index +1 mod 4 (H4 control)."""
    pts = {}
    for t in flat:
        c = GEO_CLASSES.index(t["cls"])
        if shuffle:
            c = (c + 1) % len(GEO_CLASSES)
        v = frame[:, c] + RHO * unit_noise(t["term"])
        pts[t["term"]] = v / np.linalg.norm(v)
    return pts


def match_terms(graph, flat, prompt):
    """Same matcher rules as edge/nl_route.js / kc_layer.pn_encode, but returns
    the matched term list instead of a term-index vector."""
    p = prompt.lower()
    covered = [False] * len(p)
    hits = []
    def cover(s, e):
        for k in range(s, e):
            covered[k] = True
    for t in flat:
        if not t["phrase"]:
            continue
        term = t["term"]
        idx = p.find(term)
        while idx != -1:
            if not any(covered[idx:idx + len(term)]):
                hits.append({"cls": t["cls"], "term": term, "weight": t["weight"], "pos": idx})
                cover(idx, idx + len(term))
            idx = p.find(term, idx + 1)
    for t in flat:
        if t["phrase"]:
            continue
        term = t["term"]
        for m in re.finditer(r"\b" + re.escape(term) + r"\b", p):
            if not any(covered[m.start():m.start() + len(term)]):
                hits.append({"cls": t["cls"], "term": term, "weight": t["weight"], "pos": m.start()})
                cover(m.start(), m.start() + len(term))
    cfg = graph["config"]
    fmin = cfg["fuzzy_min_term_len"]
    for m in re.finditer(r"\S+", p):
        word = re.sub(r"^[^a-z0-9\-]+|[^a-z0-9\-]+$", "", m.group(0))
        if len(word) < fmin:
            continue
        if any(covered[m.start():m.end()]):
            continue
        if any(h["pos"] <= m.start() < h["pos"] + len(h["term"]) for h in hits):
            continue
        best = None
        for t in flat:
            if t["phrase"] or len(t["term"]) < fmin:
                continue
            if edit_distance_1(word, t["term"]):
                best = t
                break
        if best:
            hits.append({"cls": best["cls"], "term": best["term"], "weight": best["weight"], "pos": m.start()})
    neg_offsets = [m.start() for m in re.finditer(r"\S+", p)
                   if any(p[m.start():].split(" ", 1)[0].startswith(n) or p[m.start():].split(" ", 1)[0] == n for n in NEG_MARKERS)]
    out = []
    for h in hits:
        neg = next((no for no in neg_offsets if no < h["pos"] and h["pos"] - no <= 16
                    and len(p[no:h["pos"]].strip().split()) - 1 <= cfg["negation_window_words"]), None)
        if neg is not None:
            continue
        out.append(h)
    return out


def pn_geo(pts, graph, flat, prompt):
    """PN(x) = L2-normalize(sum matched terms w_i * point(term_i)); per-term
    weight = max band weight over its matches (same aggregation as v0).
    Zero hits -> zero vector (default path)."""
    agg = {}
    for h in match_terms(graph, flat, prompt):
        key = h["term"]
        agg[key] = max(agg.get(key, 0.0), h["weight"])
    v = np.zeros(D_GEO)
    for term, w in agg.items():
        v += w * pts[term]
    n = np.linalg.norm(v)
    return v / n if n > 0 else v


def chain_hash(decisions):
    """fnv1a-64 chain over 'id:pred:gold' decisions (moth_notary convention)."""
    h = 0xcbf29ce484222325
    for d in decisions:
        for b in f"{d['id']}:{d['pred']}:{d['gold']}".encode("utf-8"):
            h ^= b
            h = (h * 0x100000001b3) & 0xffffffffffffffff
    return format(h, "016x")


def cv5(clean, shuffle_pts=None):
    """5-fold seeded CV, same fold construction as kc_layer.py main()."""
    idx = list(range(len(clean)))
    random.Random(SEED).shuffle(idx)
    folds = [idx[i::5] for i in range(5)]
    accs, d_accs, decisions = [], [], []
    for fi, f_ in enumerate(folds):
        m = KCModel(D_GEO)
        dm = KCModel(D_GEO, dense=True)
        train = [i for i in idx if i not in f_]
        for i in train:
            m.update(clean[i][0], clean[i][1])
            dm.update(clean[i][0], clean[i][1])
        ok = dok = 0
        for i in f_:
            pred = m.predict(clean[i][0])[0]
            dpred = dm.predict(clean[i][0])[0]
            ok += pred == clean[i][1]
            dok += dpred == clean[i][1]
            decisions.append({"id": f"fold{fi}-{i}", "pred": CLASSES[pred], "gold": CLASSES[clean[i][1]]})
        accs.append(ok / len(f_))
        d_accs.append(dok / len(f_))
    return accs, d_accs, decisions


def main():
    graph, flat = load_graph()
    for t in flat:
        assert t["cls"] in GEO_CLASSES, f"term class outside canonical 4: {t}"
    frame = prototype_frame()
    pts = make_point_map(graph, flat, frame, shuffle=False)
    pts_shuf = make_point_map(graph, flat, frame, shuffle=True)

    # ---- pre-training geometry pins G1-G3 (no learning involved) ----
    cos = frame.T @ frame
    off_diag = np.abs(cos - np.eye(4)).max()
    g1 = float(off_diag) <= 1e-9
    devs = {t: float(np.degrees(np.arccos(np.clip(np.dot(pts[t], frame[:, GEO_CLASSES.index(t_cls)]), -1, 1))))
            for t, t_cls in ((t["term"], t["cls"]) for t in flat)}
    g2_val = max(devs.values())
    g2 = g2_val <= 30.5
    within, between = [], []
    by_cls = {c: [pts[t["term"]] for t in flat if t["cls"] == c] for c in GEO_CLASSES}
    for c, vs in by_cls.items():
        for i in range(len(vs)):
            for j in range(i + 1, len(vs)):
                within.append(float(np.dot(vs[i], vs[j])))
    for i in range(len(GEO_CLASSES)):
        for j in range(i + 1, len(GEO_CLASSES)):
            for a in by_cls[GEO_CLASSES[i]]:
                for b in by_cls[GEO_CLASSES[j]]:
                    between.append(float(np.dot(a, b)))
    g3_val = float(np.mean(within) - np.mean(between))
    g3 = g3_val > 0.5

    with open(os.path.join(HERE, "..", "edge", "eval_prompts.json")) as f:
        ev = json.load(f)
    with open(os.path.join(HERE, "cast_suite.json")) as f:
        suite = json.load(f)["prompts"]

    # ---- zero-hit behavior asserted identical to v0 KC layer default path ----
    with open(os.path.join(HERE, "kc_layer.py")) as f:
        import kc_layer as kc_mod
    zero_hit_prompts = [p["prompt"] for p in ev["prompts"]
                        if not match_terms(graph, flat, p["prompt"])]
    zh_identical = all(
        kc_mod.KCModel(len(flat)).predict(np.zeros(len(flat)))[0]
        == KCModel(D_GEO).predict(np.zeros(D_GEO))[0]
        for _ in [0]) and all(
        (lambda v0v, gv: KCModel(len(flat)).predict(v0v)[0] == KCModel(D_GEO).predict(gv)[0])(
            kc_mod.pn_encode(graph, flat, p), pn_geo(pts, graph, flat, p))
        for p in zero_hit_prompts) if zero_hit_prompts else True

    clean = [(pn_geo(pts, graph, flat, p["prompt"]), CLASSES.index(p["label_class"])) for p in ev["prompts"]]
    clean_shuf = [(pn_geo(pts_shuf, graph, flat, p["prompt"]), CLASSES.index(p["label_class"])) for p in ev["prompts"]]
    degr = [(pn_geo(pts, graph, flat, p["prompt"]), CLASSES.index(p["gold"])) for p in suite]

    # ---- H1: 5-fold CV ----
    accs, d_accs, dec = cv5(clean)
    h1_mean = float(np.mean(accs))
    h1 = h1_mean >= 0.90

    # ---- H2: zero-shot degraded ----
    m = KCModel(D_GEO)
    dm = KCModel(D_GEO, dense=True)
    for pn, g in clean:
        m.update(pn, g)
        dm.update(pn, g)
    kc_deg = float(np.mean([m.predict(pn)[0] == g for pn, g in degr]))
    dense_deg = float(np.mean([dm.predict(pn)[0] == g for pn, g in degr]))
    with open(os.path.join(HERE, "cast_eval_receipt.json")) as f:
        router_deg = json.load(f)["degraded_narrow_null"]["top1"]
    h2 = kc_deg >= router_deg
    for i, (pn, g) in enumerate(degr):
        dec.append({"id": f"degr-{i}", "pred": CLASSES[m.predict(pn)[0]], "gold": CLASSES[g]})

    # ---- H3: interference ----
    trio = [CLASSES.index(c) for c in ["woodcut", "terminal", "soft"]]
    trio_items = [(pn, g) for pn, g in clean if g in trio]
    harsh_items = [(pn, g) for pn, g in clean if g == CLASSES.index("harsh")]
    m2 = KCModel(D_GEO)
    for pn, g in trio_items:
        m2.update(pn, g)
    before = float(np.mean([m2.predict(pn)[0] == g for pn, g in trio_items]))
    for pn, g in harsh_items:
        m2.update(pn, g)
    after = float(np.mean([m2.predict(pn)[0] == g for pn, g in trio_items]))
    drop = (before - after) * 100
    h3 = drop <= 5.0

    # ---- H4: geometry-shuffle control ----
    s_accs, s_d_accs, s_dec = cv5(clean_shuf)
    shuf_mean = float(np.mean(s_accs))
    approx = abs(shuf_mean - h1_mean) < 0.05
    h4 = (shuf_mean <= 0.40) and (not approx)
    dec += s_dec

    # sealed-v0 FAIL receipt + sealed v3 spec/v3 FAIL receipt hashes
    with open(os.path.join(HERE, "kc_layer_receipt.json"), "rb") as f:
        v0_hash = format(fnv1a_64(f.read().decode("utf-8")), "016x")
    with open(os.path.join(HERE, "..", "docs", "pre-registration-geopn-kc.md"), "rb") as f:
        v3_spec_hash = format(fnv1a_64(f.read().decode("utf-8")), "016x")
    with open(os.path.join(HERE, "kc_geo_receipt.json"), "rb") as f:
        v3_receipt_hash = format(fnv1a_64(f.read().decode("utf-8")), "016x")

    receipt = {
        "seed": SEED,
        "d_geo": D_GEO,
        "rho": round(RHO, 6),
        "analytic_bound_deg": 30.0,
        "v3_rho_tan30_analytic_bound_deg": 35.264,
        "prototype_frame_hash": format(
            fnv1a_64(json.dumps(np.round(frame, 12).tolist())), "016x"),
        "spec": "docs/pre-registration-geopn-kc-v4.md (sealed R1, cc93a7d)",
        "geometry_pins": {
            "G1_orthonormal_max_offdiag": off_diag, "G1_pass": bool(g1),
            "G2_max_term_deviation_deg": round(g2_val, 3),
            "G2_bar_deg": "<= 30.5 sampling margin over TRUE analytic bound 30.000 (v3's false claim: 30 at tan30; true v3 bound 35.264)",
            "G2_pass": bool(g2),
            "G3_within_minus_between_cos": round(g3_val, 4), "G3_pass": bool(g3),
            "zero_hit_prompts": len(zero_hit_prompts),
            "zero_hit_behavior_identical_to_v0": bool(zh_identical),
        },
        "tests": {
            "H1_cv5_clean": {"folds": [round(a, 3) for a in accs], "mean_top1": round(h1_mean, 4),
                             "dense_null_mean": round(float(np.mean(d_accs)), 4), "pass": bool(h1)},
            "H2_zeroshot_degraded": {"kc_top1": round(kc_deg, 4), "router_top1": router_deg,
                                     "dense_null_top1": round(dense_deg, 4), "pass": bool(h2)},
            "H3_interference": {"trio_before": round(before, 4), "trio_after": round(after, 4),
                                "drop_pts": round(drop, 2), "pass": bool(h3)},
            "H4_geometry_shuffle": {"folds": [round(a, 3) for a in s_accs], "mean_top1": round(shuf_mean, 4),
                                    "dense_null_mean": round(float(np.mean(s_d_accs)), 4),
                                    "approx_equal_to_main": bool(approx),
                                    "bar": "<= 0.40 and not ~= main", "pass": bool(h4)},
        },
        "nulls": {"chance_top1": 0.2,
                  "dense_linear_clean_mean": round(float(np.mean(d_accs)), 4),
                  "dense_linear_degraded_top1": round(dense_deg, 4)},
        "locality_rows_touched_max": m.rows_touched_max,
        "locality_pass": bool(m.rows_touched_max <= 102),
        "decision_chain_fnv1a64": chain_hash(dec),
        "sealed_v0_fail_receipt_hash": v0_hash,
        "sealed_v3_spec_hash": v3_spec_hash,
        "sealed_v3_fail_receipt_hash": v3_receipt_hash,
        "verdict": None,
    }
    allpass = (g1 and g2 and g3 and zh_identical and h1 and h2 and h3 and h4
               and receipt["locality_pass"])
    receipt["verdict"] = "PASS" if allpass else "FAIL"
    with open(os.path.join(HERE, "kc_geo_v4_receipt.json"), "w") as f:
        json.dump(receipt, f, indent=2)
    print(json.dumps(receipt, indent=2))
    return 0 if allpass else 1


if __name__ == "__main__":
    sys.exit(main())
