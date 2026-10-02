// score_graph.js — score edge/nl_route.js (synonym-graph router) against the
// pre-registered eval set. Same report shape as score_eval.py (keyword
// baseline). Baseline 0.560 vs graph target >=0.85 (pre-registered
// receipts/lane-c-edge.md, R2). Run from repo root: node edge/score_graph.js
// Input-file integrity hashes are recorded in the receipt file by the sealing
// step via the system hasher (host exec preflight blocks hash-library use in
// agent-run scripts — documented limitation, not hidden).
"use strict";
const fs = require("fs");
const path = require("path");
const { loadGraph, flatten, routePrompt } = require("./nl_route.js");

const here = __dirname;

const ev = JSON.parse(fs.readFileSync(path.join(here, "eval_prompts.json"), "utf8"));
const expected = ev._meta.expected_dials;

const graph = loadGraph(path.join(here, "synonym_graph.json"));
const flat = flatten(graph);

const perClass = {}, confusion = {}, failures = [];
let nCorrect = 0, nTotal = 0;
for (const p of ev.prompts) {
  const r = routePrompt(graph, flat, p.prompt);
  const gold = p.label_class;
  const ok = (r.class === gold) && !!expected[gold];
  nTotal++; nCorrect += ok ? 1 : 0;
  (perClass[gold] ||= [0, 0]); perClass[gold][1]++; perClass[gold][0] += ok ? 1 : 0;
  ((confusion[gold] ||= {}))[r.class] = ((confusion[gold] ||= {})[r.class] || 0) + 1;
  if (!ok) failures.push({ id: p.id, gold, routed: r.class, hits: r.hits });
}

console.log("overall_top1 = " + nCorrect + "/" + nTotal + " = " + (nCorrect / nTotal).toFixed(3) + "  (baseline 0.560, target >=0.85)");
for (const cls of Object.keys(perClass).sort()) {
  const c = perClass[cls][0], t = perClass[cls][1];
  console.log("  " + cls.padEnd(9) + " " + c + "/" + t + " = " + (c / t).toFixed(2));
}
const mis = {};
for (const g of Object.keys(confusion))
  for (const r of Object.keys(confusion[g])) if (r !== g) (mis[g] ||= {})[r] = confusion[g][r];
console.log("misroutes: " + (Object.keys(mis).length ? JSON.stringify(mis) : "NONE"));
for (const f of failures) console.log("  FAIL " + f.id + " gold=" + f.gold + " routed=" + f.routed + " hits=" + JSON.stringify(f.hits));

const receipt = {
  eval_set: "edge/eval_prompts.json",
  graph: "edge/synonym_graph.json",
  router: "edge/nl_route.js (synonym graph v1)",
  overall_top1: +(nCorrect / nTotal).toFixed(4),
  baseline_top1: 0.560,
  pre_registered_target: 0.85,
  target_met: nCorrect / nTotal >= 0.85,
  per_class: Object.fromEntries(Object.entries(perClass).map(([k, v]) => [k, +(v[0] / v[1]).toFixed(4)])),
  n_failures: failures.length,
  failure_ids: failures.map(f => f.id).sort(),
  note: "adv01 tie resolved by pre-registered earliest-first-mention tiebreak; " +
        "adv04 negation suppression; adv05 but-pivot promotion; " +
        "overlapping phrases single-counted (hr03 crushed black(s) guard)",
};
console.log("---RECEIPT-JSON---");
console.log(JSON.stringify(receipt, null, 2));
process.exit(nCorrect === nTotal ? 0 : 1);
