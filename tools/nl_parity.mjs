// =====================================================================
// nl_parity.mjs — pin the edge worker's graph router to the canonical
// reference implementation, per the pre-registered design
// (edge/synonym_graph.json _meta + edge/nl_route.js header):
//   edge/worker.ts is a MIRROR of edge/nl_route.js, pinned HERE, not
//   by aspiration. Two implementations, one behavior.
//
// Pins:
//   1. DATA   — edge/synonym_graph.mjs sha256 == sha256(edge/synonym_graph.json)
//               (generated module can never drift from canonical JSON)
//   2. EVAL   — core router output === reference router output on all 50
//               pre-registered eval prompts (class, score, hits)
//   3. FUZZ   — core router output === reference on adversarial extra probes
//               (negation, but-pivot, fuzzy-1, zero-hit, phrase overlap)
//   4. WORKER — edge/worker.ts imports ./nl_route_core.mjs, carries NO
//               STYLE_RULES keyword table, still answers MORPH_SUCCESS with
//               active_ledger_delta
//   5. DEFAULTS — graph.default_dials deep-equals the baseline the keyword
//               worker pinned (edge_eval_receipt.json: 1.3/0.15/0.5/0.3)
//
// Zero deps. Node >= 18. Run: node tools/nl_parity.mjs  (exit 0 = all pins)
// Receipt: tools/nl_parity_receipt.json
// =====================================================================
import { createRequire } from "module";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const results = [];
const pin = (name, ok, detail) => {
  results.push({ pin: name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
  return ok;
};

// ---- 1. DATA: generated graph module hashes to canonical JSON ----------
const canonicalJson = readFileSync(join(root, "edge", "synonym_graph.json"), "utf8");
const canonicalSha = createHash("sha256").update(canonicalJson).digest("hex");
let graphMod = null;
try {
  graphMod = await import(join(root, "edge", "synonym_graph.mjs"));
  pin("data:graph-module-hash",
    graphMod.GRAPH_SHA256 === canonicalSha,
    `module=${graphMod.GRAPH_SHA256?.slice(0, 16)}… json=${canonicalSha.slice(0, 16)}…`);
} catch (e) {
  pin("data:graph-module-hash", false, `edge/synonym_graph.mjs not importable: ${e.message}`);
}

// ---- load both implementations ------------------------------------------
const require = createRequire(import.meta.url);
const ref = require(join(root, "edge", "nl_route.js")); // canonical (measured 1.0)
const refGraph = ref.loadGraph(join(root, "edge", "synonym_graph.json"));
const refFlat = ref.flatten(refGraph);

let core = null;
try {
  core = await import(join(root, "edge", "nl_route_core.mjs"));
} catch (e) {
  pin("eval:core-vs-reference", false, `edge/nl_route_core.mjs not importable: ${e.message}`);
  pin("fuzz:core-vs-reference", false, "skipped — core missing");
}
const coreRouter = core ? core.makeRouter(graphMod ? graphMod.GRAPH : null) : null;

const sameRoute = (a, b) =>
  a.class === b.class && a.score === b.score && JSON.stringify(a.hits) === JSON.stringify(b.hits);

// ---- 2. EVAL: all 50 pre-registered prompts ------------------------------
{
  const ev = JSON.parse(readFileSync(join(root, "edge", "eval_prompts.json"), "utf8"));
  let bad = [];
  if (coreRouter) {
    for (const p of ev.prompts) {
      const r = ref.routePrompt(refGraph, refFlat, p.prompt);
      const c = coreRouter.route(p.prompt);
      if (!sameRoute({ class: r.class, score: r.score, hits: r.hits }, c)) {
        bad.push(p.id);
      }
    }
    pin("eval:core-vs-reference", bad.length === 0,
      bad.length === 0
        ? `${ev.prompts.length}/${ev.prompts.length} prompts identical (class, score, hits)`
        : `divergent: ${bad.join(",")}`);
  }
}

// ---- 3. FUZZ: adversarial extra probes ------------------------------------
{
  const probes = [
    "not a woodcut at all, keep it soft",        // negation window
    "soft fog but carve it like a woodcut",      // but-pivot promotion
    "wooodcutt texture on the oak",              // fuzzy-1 near-misses
    "make everything louder and brighter",       // zero-hit -> default
    "crushed blacks, crushed black shadows",     // overlapping phrase single-count
    "lo-fi phosphor glow, never harsh",          // negation on trailing term
    "OAK and COPPER PLATE, heavy gouge work",    // case + multi-phrase cover
    "",                                          // empty prompt -> default
    "hard noir shadows",                          // multi-term single class
    "ambient fog, soft ambience, but hard edges",// pivot with trailing class
  ];
  let bad = [];
  if (coreRouter) {
    for (const p of probes) {
      const r = ref.routePrompt(refGraph, refFlat, p);
      const c = coreRouter.route(p);
      if (!sameRoute({ class: r.class, score: r.score, hits: r.hits }, c)) bad.push(JSON.stringify(p));
    }
    pin("fuzz:core-vs-reference", bad.length === 0,
      bad.length === 0 ? `${probes.length}/${probes.length} probes identical` : `divergent: ${bad.join(" | ")}`);
  }
}

// ---- 4. WORKER: source pins ------------------------------------------------
{
  const src = readFileSync(join(root, "edge", "worker.ts"), "utf8");
  pin("worker:imports-core", /from\s+"\.\/nl_route_core\.mjs"/.test(src),
    'edge/worker.ts imports ./nl_route_core.mjs');
  pin("worker:no-keyword-table", !/STYLE_RULES/.test(src),
    "STYLE_RULES first-match keyword table removed from worker");
  pin("worker:response-shape", /MORPH_SUCCESS/.test(src) && /active_ledger_delta/.test(src),
    "response still { status: MORPH_SUCCESS, active_ledger_delta }");
}

// ---- 5. DEFAULTS: graph fallback === pinned baseline -----------------------
{
  const g = graphMod ? graphMod.GRAPH : {};
  const d = g.default_dials || {};
  pin("defaults:match-baseline",
    d.contrast === 1.3 && d.blackPoint === 0.15 && d.trailDecay === 0.5 && d.edgePaint === 0.3,
    `graph.default_dials=${JSON.stringify(d)} vs baseline 1.3/0.15/0.5/0.3 (edge_eval_receipt.json)`);
}

// ---- receipt ---------------------------------------------------------------
const nFail = results.filter(r => !r.ok).length;
const receipt = {
  receipt: "chiaroscuro edge NL worker graph-port parity pins",
  date: new Date().toISOString().slice(0, 10),
  branch: "edge-worker-graph-port",
  reference: "edge/nl_route.js (canonical, measured 50/50, tools/edge_graph_receipt.json)",
  core: "edge/nl_route_core.mjs (ESM port consumed by edge/worker.ts)",
  pins: results,
  all_pass: nFail === 0,
  provenance: "edge/synonym_graph.json _meta: 'worker.ts is a mirror pinned by tools/nl_parity' — this file is that pin, made executable",
};
const { writeFileSync } = await import("fs");
writeFileSync(join(root, "tools", "nl_parity_receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log(`\n${results.length - nFail}/${results.length} pins green — receipt -> tools/nl_parity_receipt.json`);
process.exit(nFail === 0 ? 0 : 1);
