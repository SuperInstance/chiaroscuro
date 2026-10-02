// =====================================================================
// nl_route.js — canonical synonym-graph router for the edge bot.
// Data: edge/synonym_graph.json (committed BEFORE any measured run, R1).
// Mirrors receipts/lane-c-edge.md pre-registered hypothesis:
//   1. weighted synonym graph (phrase-first, then whole-word, then fuzzy-1)
//   2. intent-position rule (negation window suppresses; "but"-pivot promotes)
// edge/worker.ts carries a TS mirror; tools/nl_parity.js pins data parity.
// Zero deps. Node >= 18. CLI: node nl_route.js --eval eval_prompts.json
// =====================================================================
"use strict";

const fs = require("fs");
const path = require("path");

function loadGraph(graphPath) {
  return JSON.parse(fs.readFileSync(graphPath, "utf8"));
}

// flatten graph -> [{term, class, weight, phrase}]
function flatten(graph) {
  const out = [];
  const w = graph.config.weights;
  for (const [cls, body] of Object.entries(graph.classes)) {
    for (const [band, terms] of Object.entries(body.terms)) {
      for (const t of terms) {
        out.push({ term: t, cls, weight: w[band], phrase: t.includes(" ") });
      }
    }
  }
  out.sort((a, b) => b.term.length - a.term.length); // phrase/longest first
  return out;
}

function editDistance1(a, b) {
  return editDistanceN(a, b, 1);
}

// bounded Levenshtein (O(len(a)*maxDist) band); true iff distance <= maxDist
function editDistanceN(a, b, maxDist) {
  if (Math.abs(a.length - b.length) > maxDist) return false;
  let prev = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length] <= maxDist;
}

function tokenize(prompt) {
  // tokens with byte offsets; words and space-separated spans
  const toks = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(prompt)) !== null) toks.push({ w: m[0], i: m.index });
  return toks;
}

// match graph against prompt. Returns [{cls, term, weight, pos, fuzzy}]
function match(graph, flat, prompt) {
  const p = prompt.toLowerCase();
  const toks = tokenize(p);
  const covered = new Array(p.length).fill(false);
  const hits = [];
  const coveredSpans = [];
  const cover = (s, e) => { for (let k = s; k < e; k++) covered[k] = true; coveredSpans.push([s, e]); };

  // 1. phrases (contiguous word spans, substring match); skip spans already
  // covered by an earlier (longer) phrase — no overlapping-phrase double count
  for (const { term, cls, weight } of flat.filter(x => x.phrase)) {
    let idx = p.indexOf(term);
    while (idx !== -1) {
      let overlap = false;
      for (let k = idx; k < idx + term.length; k++) if (covered[k]) { overlap = true; break; }
      if (!overlap) {
        hits.push({ cls, term, weight, pos: idx, fuzzy: false });
        cover(idx, idx + term.length);
      }
      idx = p.indexOf(term, idx + 1);
    }
  }
  // 2. whole-word single terms on uncovered text
  for (const { term, cls, weight } of flat.filter(x => !x.phrase)) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    let m;
    while ((m = re.exec(p)) !== null) {
      let ok = true;
      for (let k = m.index; k < m.index + term.length; k++) if (covered[k]) { ok = false; break; }
      if (ok) { hits.push({ cls, term, weight, pos: m.index, fuzzy: false }); cover(m.index, m.index + term.length); }
    }
  }
  // 3. fuzzy-1 on uncovered word tokens vs single-word terms
  const singles = flat.filter(x => !x.phrase);
  for (const t of toks) {
    const word = t.w.replace(/^[^a-z0-9\-]+|[^a-z0-9\-]+$/g, "");
    if (word.length < graph.config.fuzzy_min_term_len) continue;
    let anyCovered = false;
    for (let k = t.i; k < t.i + t.w.length; k++) if (covered[k]) { anyCovered = true; break; }
    if (anyCovered) continue;
    if (hits.some(h => h.pos <= t.i && t.i < h.pos + h.term.length)) continue;
    for (const { term, cls, weight } of singles) {
      if (term.length < graph.config.fuzzy_min_term_len) continue;
      if (editDistance1(word, term)) {
        hits.push({ cls, term: `${word}~${term}`, weight, pos: t.i, fuzzy: true });
        break;
      }
    }
  }
  return hits;
}

// CAST widening (JEV v2, docs/HOLDCAST-pre-registration.md — sealed pre-run):
// when the best score is below route_threshold (evidence absence — v1 would
// route default), CAST fires ONCE: synonym neighbors (edit distance <=2) of
// matched terms enter scoring at weight * neighbor_factor (0.5), then re-score.
const CAST_NEIGHBOR_DIST = 2;
const CAST_NEIGHBOR_FACTOR = 0.5;

function routePrompt(graph, flat, prompt, opts) {
  opts = opts || {};
  const castWidening = opts.castWidening !== false; // v2 default on; v1 null-control passes false
  const cfg = graph.config;
  const p = prompt.toLowerCase();
  let hits = match(graph, flat, p);

  // intent-position: negation window suppresses the matched term
  const toks = tokenize(p);
  const negOffsets = [];
  for (const t of toks) {
    if (cfg.negation_markers.some(n => t.w === n || t.w.endsWith(n))) negOffsets.push(t.i);
  }
  hits = hits.filter(h => {
    if (h.fuzzy) return true;
    const neg = negOffsets.find(no => no < h.pos && h.pos - no <= 16 && (p.slice(no, h.pos).trim().split(/\s+/).length - 1) <= cfg.negation_window_words);
    return neg === undefined;
  });

  // intent-position: "but"-pivot promotes trailing clause
  const pivot = p.search(/\bbut\b/);
  const trailingClasses = new Set();
  if (pivot !== -1) {
    for (const h of hits) if (h.pos > pivot) trailingClasses.add(h.cls);
  }

  // score
  const scores = {};
  const firstPos = {};
  for (const h of hits) {
    let w = h.weight;
    if (pivot !== -1 && h.pos > pivot && trailingClasses.size > 0) w *= cfg.but_pivot_multiplier;
    scores[h.cls] = (scores[h.cls] || 0) + w;
    if (!(h.cls in firstPos) || h.pos < firstPos[h.cls]) firstPos[h.cls] = h.pos;
  }

  let candidates = Object.keys(scores);
  if (trailingClasses.size > 0) candidates = candidates.filter(c => trailingClasses.has(c));

  let best = null;
  for (const c of candidates) {
    if (scores[c] < cfg.route_threshold) continue;
    if (best === null) { best = c; continue; }
    if (scores[c] > scores[best]) best = c;
    else if (scores[c] === scores[best] && firstPos[c] < firstPos[best]) best = c; // pre-registered tiebreak
  }

  let cls = best || "default";
  let castFired = false;
  // CAST: structured exploration on evidence absence (odor-OFF casting).
  // Revision 1 (pre-reg): fires whenever best === null — whether hits exist or
  // not. No hits: every prompt word >= fuzzy_min_term_len is a base; hits: only
  // matched-term roots. Neighbors = graph terms at edit distance <=2, weight x0.5.
  if (castWidening && best === null) {
    const bases = [];
    if (hits.length > 0) {
      for (const h of hits) bases.push(h.term.split("~").pop());
    } else {
      for (const t of tokenize(p)) {
        const word = t.w.replace(/^[^a-z0-9\-]+|[^a-z0-9\-]+$/g, "");
        if (word.length >= cfg.fuzzy_min_term_len) bases.push(word);
      }
    }
    const neighbors = [];
    for (const base of bases) {
      for (const t of flat) {
        if (!t.phrase && t.term === base) continue;
        if (Math.abs(t.term.length - base.length) > CAST_NEIGHBOR_DIST) continue;
        if (editDistanceN(base, t.term, CAST_NEIGHBOR_DIST)) {
          neighbors.push({ cls: t.cls, term: `${base}~${t.term}(cast)`, weight: t.weight * CAST_NEIGHBOR_FACTOR });
        }
      }
    }
    if (neighbors.length > 0) {
      const seenCls = {};
      for (const n of neighbors) {
        scores[n.cls] = (scores[n.cls] || 0) + n.weight;
        if (!(n.cls in firstPos)) firstPos[n.cls] = 0;
        (seenCls[n.cls] ||= []).push(n.term);
      }
      let castBest = null;
      for (const c of Object.keys(scores)) {
        if (scores[c] < cfg.route_threshold) continue;
        if (castBest === null) { castBest = c; continue; }
        if (scores[c] > scores[castBest]) castBest = c;
        else if (scores[c] === scores[castBest]) castBest = c; // single-term neighbors: keep first (deterministic)
      }
      if (castBest !== null) { best = castBest; cls = castBest; castFired = true; hits = hits.concat(neighbors); }
    }
  }
  return {
    class: cls,
    cast: castFired,
    dials: (graph.classes[cls] || {}).dials || graph.default_dials,
    score: best ? scores[best] : 0,
    hits: hits.map(h => `${h.cls}:${h.term}${h.fuzzy ? "(fuzzy)" : ""}@${h.pos}`),
  };
}

function main() {
  const args = process.argv.slice(2);
  const evalIdx = args.indexOf("--eval");
  const here = __dirname;
  const graph = loadGraph(path.join(here, "synonym_graph.json"));
  const flat = flatten(graph);
  if (evalIdx !== -1) {
    const ev = JSON.parse(fs.readFileSync(args[evalIdx + 1], "utf8"));
    for (const pr of ev.prompts) {
      const r = routePrompt(graph, flat, pr.prompt);
      console.log(JSON.stringify({ id: pr.id, gold: pr.label_class, routed: r.class, score: r.score, hits: r.hits }));
    }
    return;
  }
  const promptIdx = args.indexOf("--prompt");
  if (promptIdx !== -1) {
    console.log(JSON.stringify(routePrompt(graph, flat, args[promptIdx + 1]), null, 2));
    return;
  }
  if (args.includes("--score")) {
    // measured-run mode: route the pinned eval set, print report + receipt
    // body (input-file hashes are recorded at seal time by the system hasher)
    const ev = JSON.parse(fs.readFileSync(path.join(here, "eval_prompts.json"), "utf8"));
    const expected = ev._meta.expected_dials;
    const perClass = {}, confusion = {}, failures = [];
    let nCorrect = 0;
    for (const p of ev.prompts) {
      const r = routePrompt(graph, flat, p.prompt);
      const gold = p.label_class;
      const ok = (r.class === gold) && !!expected[gold];
      nCorrect += ok ? 1 : 0;
      (perClass[gold] ||= [0, 0]); perClass[gold][1]++; perClass[gold][0] += ok ? 1 : 0;
      ((confusion[gold] ||= {}))[r.class] = ((confusion[gold] ||= {})[r.class] || 0) + 1;
      if (!ok) failures.push({ id: p.id, gold, routed: r.class, hits: r.hits });
    }
    const nTotal = ev.prompts.length;
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
    if (nCorrect !== nTotal) process.exit(1);
    return;
  }
  console.error("usage: node nl_route.js --eval <prompts.json> | --prompt <text> | --score");
  process.exit(2);
}

module.exports = { loadGraph, flatten, routePrompt };

if (require.main === module) main();
