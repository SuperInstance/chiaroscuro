#!/usr/bin/env python3
"""
score_graph.py — score edge/nl_route.js (synonym-graph router) against the
pre-registered eval set. Same report shape as score_eval.py (keyword baseline);
writes tools/edge_graph_receipt.json. Baseline 0.560 vs graph target >=0.85
(pre-registered in receipts/lane-c-edge.md, R2).
"""
import json, hashlib, subprocess, sys, os

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.join(here, "..")


def main():
    with open(os.path.join(here, "eval_prompts.json")) as f:
        ev = json.load(f)
    expected = ev["_meta"]["expected_dials"]

    h = hashlib.sha256()
    with open(os.path.join(here, "eval_prompts.json"), "rb") as f:
        h.update(f.read())
    eval_hash = h.hexdigest()

    with open(os.path.join(here, "synonym_graph.json"), "rb") as f:
        graph_hash = hashlib.sha256(f.read()).hexdigest()

    out = subprocess.run(
        ["node", os.path.join(here, "nl_route.js"), "--eval",
         os.path.join(here, "eval_prompts.json")],
        capture_output=True, text=True, check=True)
    rows = [json.loads(l) for l in out.stdout.strip().splitlines()]

    per_class, confusion, failures = {}, {}, {}
    n_correct = n_total = 0
    for r in rows:
        gold = r["gold"]
        dials = expected.get(r["routed"])
        ok = (r["routed"] == gold) and (dials is not None)
        n_total += 1
        n_correct += ok
        per_class.setdefault(gold, [0, 0])
        per_class[gold][1] += 1
        per_class[gold][0] += ok
        confusion.setdefault(gold, {}).setdefault(r["routed"], 0)
        confusion[gold][r["routed"]] += 1
        if not ok:
            failures[r["id"]] = r

    print(f"eval_set_sha256 = {eval_hash}")
    print(f"graph_sha256    = {graph_hash[:16]}...")
    print(f"overall_top1 = {n_correct}/{n_total} = {n_correct/n_total:.3f}  (baseline 0.560, target >=0.85)")
    for cls in sorted(per_class):
        c, t = per_class[cls]
        print(f"  {cls:9s} {c}/{t} = {c/t:.2f}")
    misroutes = {g: {r: n for r, n in d.items() if r != g} for g, d in confusion.items()}
    misroutes = {g: d for g, d in misroutes.items() if d}
    print(f"misroutes: {json.dumps(misroutes) if misroutes else 'NONE'}")
    if failures:
        for fid, r in failures.items():
            print(f"  FAIL {fid} gold={r['gold']} routed={r['routed']} hits={r['hits']}")

    receipt = {
        "eval_set_sha256": eval_hash,
        "graph_sha256": graph_hash,
        "router": "edge/nl_route.js (synonym graph v1)",
        "overall_top1": round(n_correct / n_total, 4),
        "baseline_top1": 0.560,
        "pre_registered_target": 0.85,
        "target_met": n_correct / n_total >= 0.85,
        "per_class": {k: round(v[0] / v[1], 4) for k, v in per_class.items()},
        "n_failures": len(failures),
        "failure_ids": sorted(failures.keys()),
        "note": "adv01 tie resolved by pre-registered earliest-first-mention tiebreak; "
                "adv04 negation suppression; adv05 but-pivot promotion",
    }
    with open(os.path.join(root, "tools", "edge_graph_receipt.json"), "w") as f:
        json.dump(receipt, f, indent=2)
    print("receipt -> tools/edge_graph_receipt.json")
    sys.exit(0 if n_correct == n_total else 1)


if __name__ == "__main__":
    main()
