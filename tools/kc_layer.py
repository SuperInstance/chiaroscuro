#!/usr/bin/env python3
"""
kc_layer.py — fly mushroom-body readout over the synonym graph.
Build 4.2 of docs/FRUITFLY-JEV-MOTH.md; pre-registered in
docs/pre-registration-fly-v0.md (SEALED BEFORE measured runs, R1).

Architecture (fly MB mapping):
  PN layer  : prompt -> flattened-graph term activation vector (~200-dim,
              value = band weight of each matched term, phrase/word/fuzzy-1
              port of edge/nl_route.js matching rules)
  KC layer  : seeded random projection V->2048 (PN->KC synapses, ~10% density,
              RNG seed 20261001), WTA top-102 (5%)
  MBON      : per-class readout W[5][2048] init 1.0; score = sum active rows
  Plasticity: DEPRESSION-ONLY (DAN-analog): on mistake W[pred][active] *= 0.8.
              Correct -> no write. Locality pin: <=102 rows touched/update.

Tests: 5-fold seeded CV over clean 50 (mean top-1 >= 0.90); zero-shot on the
58-prompt degraded suite after training all 50 clean (>= router-on-degraded);
interference (train trio -> train harsh -> retest trio, drop <= 5 pts);
dense-linear + chance nulls.
"""
import json, os, random, re, sys
import numpy as np

SEED = 20261001
V_KC = 2048
WTA = 102
ETA = 0.2
HERE = os.path.dirname(os.path.abspath(__file__))
CLASSES = ["woodcut", "terminal", "soft", "harsh", "default"]

def load_graph():
    with open(os.path.join(HERE, "..", "edge", "synonym_graph.json")) as f:
        g = json.load(f)
    flat = []
    for cls, bands in g["classes"].items():
        for band, terms in bands.get("terms", {}).items():
            for term in terms:
                flat.append({"term": term.lower(), "cls": cls,
                             "weight": g["config"]["weights"][band],
                             "phrase": " " in term})
    return g, flat

NEG_MARKERS = ["not", "n't", "never", "no"]

def pn_encode(graph, flat, prompt):
    """Port of nl_route.js matching: phrase cover -> word cover -> fuzzy-1,
    negation window filter. Returns V-dim activation vector."""
    p = prompt.lower()
    covered = [False] * len(p)
    hits = []
    def cover(s, e):
        for k in range(s, e): covered[k] = True
    for t in flat:
        if not t["phrase"]: continue
        term = t["term"]; idx = p.find(term)
        while idx != -1:
            if not any(covered[idx:idx+len(term)]):
                hits.append({"cls": t["cls"], "term": term, "weight": t["weight"], "pos": idx, "fuzzy": False})
                cover(idx, idx + len(term))
            idx = p.find(term, idx + 1)
    for t in flat:
        if t["phrase"]: continue
        term = t["term"]
        for m in re.finditer(r"\b" + re.escape(term) + r"\b", p):
            if not any(covered[m.start():m.start()+len(term)]):
                hits.append({"cls": t["cls"], "term": term, "weight": t["weight"], "pos": m.start(), "fuzzy": False})
                cover(m.start(), m.start() + len(term))
    cfg = graph["config"]
    fmin = cfg["fuzzy_min_term_len"]
    for m in re.finditer(r"\S+", p):
        word = re.sub(r"^[^a-z0-9\-]+|[^a-z0-9\-]+$", "", m.group(0))
        if len(word) < fmin: continue
        if any(covered[m.start():m.end()]): continue
        if any(h["pos"] <= m.start() < h["pos"] + len(h["term"]) for h in hits): continue
        best = None
        for t in flat:
            if t["phrase"] or len(t["term"]) < fmin: continue
            if edit_distance_1(word, t["term"]): best = t; break
        if best:
            hits.append({"cls": best["cls"], "term": word + "~" + best["term"], "weight": best["weight"], "pos": m.start(), "fuzzy": True})
    # negation window filter
    neg_offsets = [m.start() for m in re.finditer(r"\S+", p)
                   if any(p[m.start():].split(" ", 1)[0].startswith(n) or p[m.start():].split(" ", 1)[0] == n for n in NEG_MARKERS)]
    out = []
    for h in hits:
        if not h["fuzzy"]:
            neg = next((no for no in neg_offsets if no < h["pos"] and h["pos"] - no <= 16
                        and len(p[no:h["pos"]].strip().split()) - 1 <= cfg["negation_window_words"]), None)
            if neg is not None: continue
        out.append(h)
    v = np.zeros(len(flat))
    term_index = {t["term"]: i for i, t in enumerate(flat)}
    for h in out:
        key = h["term"].split("~")[-1] if "~" in h["term"] else h["term"]
        if key in term_index: v[term_index[key]] = max(v[term_index[key]], h["weight"])
    return v

def edit_distance_1(a, b):
    if abs(len(a) - len(b)) > 1: return False
    i = j = diff = 0
    while i < len(a) and j < len(b):
        if a[i] == b[j]: i += 1; j += 1; continue
        diff += 1
        if diff > 1: return False
        if len(a) == len(b): i += 1; j += 1
        elif len(a) < len(b): j += 1
        else: i += 1
    return diff + (len(a) - i) + (len(b) - j) <= 1

class KCModel:
    def __init__(self, V, dense=False):
        rng = random.Random(SEED)
        self.dense = dense
        if dense:
            self.proj = None
            self.V = V
        else:
            self.proj = np.zeros((V, V_KC))
            for i in range(V):
                for j in range(V_KC):
                    if rng.random() < 0.10:
                        self.proj[i, j] = rng.uniform(-1.0, 1.0)
        self.W = np.ones((len(CLASSES), V_KC if not dense else V))
        self.rows_touched_max = 0

    def kc(self, pn):
        if self.dense: return pn
        act = pn @ self.proj
        if act.max() <= 0: return np.zeros(V_KC, dtype=bool)
        thr = np.partition(act, -WTA)[-WTA]
        return act >= max(thr, 1e-9)

    def predict(self, pn):
        active = self.kc(pn)
        if self.dense:
            scores = self.W @ pn
            return int(np.argmax(scores)), active, scores
        scores = self.W[:, active].sum(axis=1) if active.any() else np.zeros(len(CLASSES))
        return int(np.argmax(scores)), active, scores

    def update(self, pn, gold_idx):
        pred, active, _ = self.predict(pn)
        touched = 0
        if pred != gold_idx and (active.any() if isinstance(active, np.ndarray) else False):
            if self.dense:
                nz = np.abs(pn) > 1e-12
                self.W[pred, nz] *= (1 - ETA)
                touched = int(nz.sum())
            else:
                self.W[pred, active] *= (1 - ETA)
                touched = int(active.sum())
            self.rows_touched_max = max(self.rows_touched_max, touched)
        return pred != gold_idx, touched

def top1_of(model, pn):
    return model.predict(pn)[0]

def main():
    graph, flat = load_graph()
    with open(os.path.join(HERE, "..", "edge", "eval_prompts.json")) as f:
        ev = json.load(f)
    with open(os.path.join(HERE, "cast_suite.json")) as f:
        suite = json.load(f)["prompts"]
    clean = [(pn_encode(graph, flat, p["prompt"]), CLASSES.index(p["label_class"])) for p in ev["prompts"]]
    degr = [(pn_encode(graph, flat, p["prompt"]), CLASSES.index(p["gold"])) for p in suite]

    receipt = {"seed": SEED, "kc": V_KC, "wta": WTA, "eta": ETA,
               "proj_density": None if False else 0.10, "dense_null": True,
               "locality_pin_rows_max": WTA, "tests": {}, "verdict": None}

    # (a) 5-fold seeded CV over clean 50
    idx = list(range(len(clean)))
    random.Random(SEED).shuffle(idx)
    folds = [idx[i::5] for i in range(5)]
    accs, dense_accs = [], []
    for f_ in folds:
        m = KCModel(len(flat)); dm = KCModel(len(flat), dense=True)
        train = [i for i in idx if i not in f_]
        for i in train: m.update(*clean[i]); dm.update(*clean[i])
        ok = sum(1 for i in f_ if top1_of(m, clean[i][0]) == clean[i][1])
        dok = sum(1 for i in f_ if top1_of(dm, clean[i][0]) == clean[i][1])
        accs.append(ok / len(f_)); dense_accs.append(dok / len(f_))
    mean_cv = float(np.mean(accs)); mean_dcv = float(np.mean(dense_accs))
    receipt["tests"]["a_cv5_clean"] = {"folds": [round(a, 3) for a in accs],
        "mean_top1": round(mean_cv, 4), "pass": mean_cv >= 0.90,
        "dense_null_mean": round(mean_dcv, 4)}

    # (b) train all 50 clean once -> zero-shot degraded 58; compare vs router
    m = KCModel(len(flat)); dm = KCModel(len(flat), dense=True)
    for pn, g in clean: m.update(pn, g); dm.update(pn, g)
    kc_deg = np.mean([top1_of(m, pn) == g for pn, g in degr])
    dense_deg = np.mean([top1_of(dm, pn) == g for pn, g in degr])
    with open(os.path.join(HERE, "cast_eval_receipt.json")) as f:
        router_deg = json.load(f)["degraded_narrow_null"]["top1"]
    receipt["tests"]["b_zeroshot_degraded"] = {
        "kc_top1": round(float(kc_deg), 4), "router_top1": router_deg,
        "dense_null_top1": round(float(dense_deg), 4),
        "pass": kc_deg >= router_deg}

    # (c) interference: train trio -> train harsh -> retest trio
    trio = [CLASSES.index(c) for c in ["woodcut", "terminal", "soft"]]
    trio_items = [(pn, g) for pn, g in clean if g in trio]
    harsh_items = [(pn, g) for pn, g in clean if g == CLASSES.index("harsh")]
    m2 = KCModel(len(flat))
    for pn, g in trio_items: m2.update(pn, g)
    before = np.mean([top1_of(m2, pn) == g for pn, g in trio_items])
    for pn, g in harsh_items: m2.update(pn, g)
    after = np.mean([top1_of(m2, pn) == g for pn, g in trio_items])
    drop = (before - after) * 100
    receipt["tests"]["c_interference"] = {
        "trio_before": round(float(before), 4), "trio_after": round(float(after), 4),
        "drop_pts": round(float(drop), 2), "pass": drop <= 5.0}

    # locality pin + chance null
    receipt["locality_rows_touched_max"] = m.rows_touched_max
    receipt["locality_pass"] = m.rows_touched_max <= WTA
    receipt["chance_null_top1"] = 0.2
    allpass = all(t["pass"] for t in receipt["tests"].values()) and receipt["locality_pass"]
    receipt["verdict"] = "PASS" if allpass else "FAIL"

    def S(o):
        if isinstance(o, dict): return {k: S(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)): return [S(v) for v in o]
        if isinstance(o, (np.bool_,)): return bool(o)
        if isinstance(o, (np.integer,)): return int(o)
        if isinstance(o, (np.floating,)): return float(o)
        return o
    receipt = S(receipt)

    with open(os.path.join(HERE, "kc_layer_receipt.json"), "w") as f:
        json.dump(receipt, f, indent=2)
    print(json.dumps(receipt, indent=2))
    return 0 if allpass else 1

if __name__ == "__main__":
    sys.exit(main())
