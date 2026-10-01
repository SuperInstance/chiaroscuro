// =====================================================================
// nl_parity.js — pins the worker.ts mirror to the canonical router.
// Canonical: edge/nl_route.js (node) over edge/synonym_graph.json.
// Mirror:    edge/worker.ts (Cloudflare Worker TS) — MUST route identically.
// Data parity is structural: worker.ts imports the SAME synonym_graph.json,
// so this runner compares per-prompt outcomes (class, dials, score, hits)
// across the pinned 50-prompt eval set. Any divergence = exit 1.
// Zero deps. Node >= 22 (worker.ts imported via native type stripping).
// CLI: node tools/nl_parity.js            (full 50-prompt parity)
//      node tools/nl_parity.js --receipt  (also write tools/nl_parity_receipt.json)
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const here = __dirname;
const root = path.join(here, "..");

function sha256(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

async function main() {
  const graph = JSON.parse(fs.readFileSync(path.join(root, "edge", "synonym_graph.json"), "utf8"));
  const flat = require(path.join(root, "edge", "nl_route.js")).flatten(graph);
  const routeCanonical = require(path.join(root, "edge", "nl_route.js")).routePrompt;
  const ev = JSON.parse(fs.readFileSync(path.join(root, "edge", "eval_prompts.json"), "utf8"));

  // The mirror: worker.ts. Native node type stripping imports the TS directly.
  const worker = await import(path.join(root, "edge", "worker.ts"));
  if (typeof worker.routePrompt !== "function") {
    console.error("PARITY FAIL: edge/worker.ts exports no routePrompt — mirror is not the graph router");
    process.exit(1);
  }

  let nDiverge = 0;
  const divergences = [];
  for (const pr of ev.prompts) {
    const a = routeCanonical(graph, flat, pr.prompt);
    const b = worker.routePrompt(graph, pr.prompt);
    const same =
      a.class === b.class &&
      a.score === b.score &&
      JSON.stringify(a.dials) === JSON.stringify(b.dials) &&
      JSON.stringify(a.hits) === JSON.stringify(b.hits);
    if (!same) {
      nDiverge++;
      divergences.push({ id: pr.id, canonical: a, mirror: b });
      console.log("DIVERGE " + pr.id + " canonical=" + a.class + " mirror=" + b.class);
    }
  }
  const nTotal = ev.prompts.length;
  console.log("parity " + (nTotal - nDiverge) + "/" + nTotal + " identical (class+dials+score+hits)");
  for (const d of divergences) {
    console.log("  " + d.id + " canonical=" + JSON.stringify(d.canonical));
    console.log("  " + d.id + " mirror    =" + JSON.stringify(d.mirror));
  }

  if (process.argv.includes("--receipt")) {
    const files = ["edge/worker.ts", "edge/nl_route.js", "edge/synonym_graph.json", "edge/eval_prompts.json", "tools/nl_parity.js"];
    const receipt = {
      receipt: "chiaroscuro edge NL worker.ts mirror parity",
      date: new Date().toISOString().slice(0, 10),
      canonical: "edge/nl_route.js",
      mirror: "edge/worker.ts",
      eval_set: "edge/eval_prompts.json",
      n_total: nTotal,
      n_identical: nTotal - nDiverge,
      parity: nDiverge === 0 ? "FULL" : "DIVERGENT",
      sha256: Object.fromEntries(files.map(f => [f, sha256(path.join(root, f))])),
    };
    fs.writeFileSync(path.join(here, "nl_parity_receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
    console.log("receipt written: tools/nl_parity_receipt.json");
  }

  process.exit(nDiverge === 0 ? 0 : 1);
}

main().catch(e => { console.error("PARITY ERROR: " + e.message); process.exit(2); });
