// score_routes.js — scorer for the synonym-graph router. Reads the router's
// JSONL output (node edge/nl_route.js --eval edge/eval_prompts.json) plus the
// eval set, prints the report and the receipt body. Pure data script: no local
// requires, no hash libraries (input hashes recorded at seal time by the
// system hasher — documented limitation, not hidden).
// Usage: node edge/score_routes.js --routes /tmp/graph_routes.jsonl
"use strict";
const fs = require("fs");
const path = require("path");

const here = __dirname;
const args = process.argv.slice(2);
const routesPath = args[args.indexOf("--routes") + 1];

const rows = fs.readFileSync(routesPath, "utf8").trim().split("\n").map(l => JSON.parse(l));
const ev = JSON.parse(fs.readFileSync(path.join(here, "eval_prompts.json"), "utf8"));
const expected = ev._meta.expected_dials;

const perClass = {}, confusion = {}, failures = [];
let nCorrect = 0;
for (const r of rows) {
  const gold = r.gold;
  const ok = (r.routed === gold) && !!expected[gold];
  nCorrect += ok ? 1 : 0;
  (perClass[gold] ||= [0, 0]); perClass[gold][1]++; perClass[gold][0] += ok ? 1 : 0;
  ((confusion[gold] ||= {}))[r.routed] = ((confusion[gold] ||= {})[r.routed] || 0) + 1;
  if (!ok) failures.push(r);
}
const nTotal = rows.length;

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
