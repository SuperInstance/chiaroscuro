#!/usr/bin/env python3
"""
score_eval.py — score the ORIGINAL keyword table (edge/worker.ts STYLE_RULES
as of Round 3) against the pre-registered eval set (edge/eval_prompts.json, R2).
HISTORICAL BASELINE INSTRUMENT: measured 0.560 (tools/edge_eval_receipt.json).
The worker no longer carries this table — it routes through the synonym-graph
router (edge/nl_route_core.mjs, parity-pinned by tools/nl_parity.mjs, measured
50/50 via edge/score_graph.py -> tools/edge_graph_receipt.json). This file stays
as the frozen baseline so the graph router's lift remains re-derivable.
Rules copied verbatim from the Round-3 keyword worker (first keyword match wins):
  woodcut/carve/engraving -> {contrast:1.8, blackPoint:0.40, trailDecay:0.4, edgePaint:0.9}
  terminal/lo-fi/phosphor/retro -> {contrast:1.4, blackPoint:0.25, trailDecay:0.8, edgePaint:0.1}
  soft/ambient/fog -> {contrast:0.9, blackPoint:0.05, trailDecay:0.9, edgePaint:0.0}
  harsh/noir/hard -> {contrast:2.1, blackPoint:0.50, trailDecay:0.2, edgePaint:1.0}
  default -> {contrast:1.3, blackPoint:0.15, trailDecay:0.5, edgePaint:0.3}
"""
import json, hashlib, sys, os

RULES = [
    (("woodcut", "carve", "engraving"), "woodcut",
     {"contrast": 1.8, "blackPoint": 0.40, "trailDecay": 0.4, "edgePaint": 0.9}),
    (("terminal", "lo-fi", "phosphor", "retro"), "terminal",
     {"contrast": 1.4, "blackPoint": 0.25, "trailDecay": 0.8, "edgePaint": 0.1}),
    (("soft", "ambient", "fog"), "soft",
     {"contrast": 0.9, "blackPoint": 0.05, "trailDecay": 0.9, "edgePaint": 0.0}),
    (("harsh", "noir", "hard"), "harsh",
     {"contrast": 2.1, "blackPoint": 0.50, "trailDecay": 0.2, "edgePaint": 1.0}),
]
DEFAULT = ("default", {"contrast": 1.3, "blackPoint": 0.15, "trailDecay": 0.5, "edgePaint": 0.3})


def route(prompt: str):
    p = prompt.lower()
    for keywords, cls, dials in RULES:
        for kw in keywords:
            if kw in p:
                return cls, dials
    return DEFAULT[0], DEFAULT[1]


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, "eval_prompts.json")) as f:
        ev = json.load(f)
    expected = ev["_meta"]["expected_dials"]

    h = hashlib.sha256()
    with open(os.path.join(here, "eval_prompts.json"), "rb") as f:
        h.update(f.read())
    eval_hash = h.hexdigest()

    per_class = {}
    confusion = {}
    failures = []
    n_correct = 0
    n_total = 0
    for p in ev["prompts"]:
        cls, dials = route(p["prompt"])
        gold = p["label_class"]
        ok = (cls == gold) and (dials == expected[gold])
        n_total += 1
        n_correct += ok
        per_class.setdefault(gold, [0, 0])
        per_class[gold][1] += 1
        per_class[gold][0] += ok
        confusion.setdefault(gold, {}).setdefault(cls, 0)
        confusion[gold][cls] += 1
        if not ok:
            failures.append({"id": p["id"], "prompt": p["prompt"], "gold": gold,
                             "routed": cls, "note": p.get("note", "")})

    print(f"eval_set_sha256 = {eval_hash}")
    print(f"overall_top1 = {n_correct}/{n_total} = {n_correct/n_total:.3f}")
    for cls in sorted(per_class):
        c, t = per_class[cls]
        print(f"  {cls:9s} {c}/{t} = {c/t:.2f}")
    print("confusion (gold -> routed: count):")
    for gold in sorted(confusion):
        for routed, cnt in sorted(confusion[gold].items(), key=lambda x: -x[1]):
            mark = "" if routed == gold else "  <-- MISROUTE"
            print(f"  {gold:9s} -> {routed:9s} x{cnt}{mark}")
    print(f"failures ({len(failures)}):")
    for f in failures:
        print(f"  {f['id']:6s} gold={f['gold']:8s} routed={f['routed']:8s} "
              f"'{f['prompt']}'  {f['note']}")
    # machine-readable receipt line
    receipt = {
        "eval_set_sha256": eval_hash,
        "overall_top1": round(n_correct / n_total, 4),
        "per_class": {k: round(v[0] / v[1], 4) for k, v in per_class.items()},
        "n_failures": len(failures),
        "failure_ids": [f["id"] for f in failures],
    }
    with open(os.path.join(here, "..", "tools", "edge_eval_receipt.json"), "w") as f:
        json.dump(receipt, f, indent=2)
    print("receipt -> tools/edge_eval_receipt.json")


if __name__ == "__main__":
    main()
