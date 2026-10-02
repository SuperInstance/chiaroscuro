#!/usr/bin/env node
/*
 * cast_route.js — CAST policy runner for the edge NL router.
 * Build 4.3 of docs/FRUITFLY-JEV-MOTH.md; pre-registered in
 * docs/pre-registration-fly-v0.md (SEALED BEFORE this run, R1).
 *
 * Policy: narrow route via canonical edge/nl_route.js; CAST trigger when
 * best < 1.5*route_threshold OR (top1-top2) < 0.5; CAST action = canonical
 * routePrompt over a WIDENED graph view (fuzzy_min 4->3, negation window
 * 2->4, weights +0.5/band); CAST overtakes only if wide_best >= narrow+0.5
 * (anti-thrash pin). Degraded suite: seeded corruption of the pinned 50 +
 * 8 unseen-phrasing rewrites (seed 20261001).
 *
 * H-cast: CAST top-1 >= narrow + 10 pts on degraded; clean stays 50/50;
 * mean wide candidates <= 3x narrow. Null: CAST disabled.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { loadGraph, flatten, routePrompt } = require(path.join(__dirname, "..", "edge", "nl_route.js"));

const SEED = 20261001;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- seeded degradation: per-word char drop/swap, p=0.15, words >= 4 chars
function degrade(prompt, rnd) {
  return prompt.split(" ").map(w => {
    if (w.length < 4 || rnd() >= 0.15) return w;
    const chars = w.split("");
    const i = 1 + Math.floor(rnd() * (chars.length - 2));
    if (rnd() < 0.5 && chars.length > 4) chars.splice(i, 1);           // drop
    else { const j = 1 + Math.floor(rnd() * (chars.length - 2));       // swap
           [chars[i], chars[j]] = [chars[j], chars[i]]; }
    return chars.join("");
  }).join(" ");
}

// ---- 8 unseen-phrasing rewrites (out-of-graph vocabulary, same labels)
const UNSEEN = [
  { id: "un01", prompt: "chisel-cut relief print aesthetic", label_class: "woodcut" },
  { id: "un02", prompt: "block printed poster with heavy ink", label_class: "woodcut" },
  { id: "un03", prompt: "green monochrome command line feel", label_class: "terminal" },
  { id: "un04", prompt: " phosphor terminal typing vibes", label_class: "terminal" },
  { id: "un05", prompt: "gentle diffused morning light look", label_class: "soft" },
  { id: "un06", prompt: "feathered airy delicate rendering", label_class: "soft" },
  { id: "un07", prompt: "brutalist razor edge contrast", label_class: "harsh" },
  { id: "un08", prompt: "searing overexposed stark finish", label_class: "harsh" },
];

// ---- per-class score port (for margin + candidate counts).
// Parity-checked against canonical routePrompt top-1 on all clean prompts.
function bigrams(s) { const set = new Set(); for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2)); return set; }
function jaccard(a, b) {
  const A = bigrams(a), B = bigrams(b);
  let inter = 0; for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

// CAST v2 (pre-registration-fly-v0-castv2.md): zero-evidence modality
// fallback. Fires ONLY when canonical match yields 0 hits; adds weak hits
// (weight 1.0*sim) for tokens with char-bigram Jaccard >= 0.5 vs any term.
function zeroEvidenceFallback(flat, p, hits) {
  if (hits.length !== 0) return { hits, fired: false };
  const out = hits.slice();
  const re = /\S+/g; let m;
  while ((m = re.exec(p)) !== null) {
    const word = m[0].replace(/^[^a-z0-9\-]+|[^a-z0-9\-]+$/g, "");
    if (word.length < 4) continue;
    let bestSim = 0, bestTerm = null;
    for (const { term, cls } of flat) {
      if (term.length < 4) continue;
      const sim = jaccard(word, term);
      if (sim > bestSim) { bestSim = sim; bestTerm = { term, cls }; }
    }
    if (bestTerm && bestSim >= 0.5) {
      out.push({ cls: bestTerm.cls, term: `${word}~${bestTerm.term}`,
                 weight: +(1.0 * bestSim).toFixed(3), pos: m.index, fuzzy: true });
    }
  }
  return { hits: out, fired: true };
}

function scoreAll(graph, flat, prompt, useFallbackV2) {
  const cfg = graph.config;
  const p = prompt.toLowerCase();
  let hits = matchPort(graph, flat, p);
  let fellBack = false;
  if (useFallbackV2) {
    const fb = zeroEvidenceFallback(flat, p, hits);
    hits = fb.hits; fellBack = fb.fired;
  }
  const toks = p.match(/\S+/g) || [];
  const negOffsets = [];
  p.replace(/\S+/g, (w, off) => {
    if (cfg.negation_markers.some(n => w === n || w.endsWith(n))) negOffsets.push(off);
    return w;
  });
  const pivot = p.search(/\bbut\b/);
  const trailing = new Set();
  if (pivot !== -1) for (const h of hits) if (h.pos > pivot) trailing.add(h.cls);
  const scores = {}, firstPos = {};
  for (const h of hits) {
    let w = h.weight;
    if (pivot !== -1 && h.pos > pivot && trailing.size > 0) w *= cfg.but_pivot_multiplier;
    scores[h.cls] = (scores[h.cls] || 0) + w;
    if (!(h.cls in firstPos) || h.pos < firstPos[h.cls]) firstPos[h.cls] = h.pos;
  }
  let candidates = Object.keys(scores);
  if (trailing.size > 0) candidates = candidates.filter(c => trailing.has(c));
  let best = null;
  for (const c of candidates) {
    if (scores[c] < cfg.route_threshold) continue;
    if (best === null) best = c;
    else if (scores[c] > scores[best]) best = c;
    else if (scores[c] === scores[best] && firstPos[c] < firstPos[best]) best = c;
  }
  const sorted = candidates.map(c => [c, scores[c]]).sort((a, b) => b[1] - a[1]);
  return { best: best || "default", score: best ? scores[best] : 0,
           nCandidates: candidates.length, sorted, fellBack };
}

function editDistance1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    diff++;
    if (diff > 1) return false;
    if (a.length === b.length) { i++; j++; }
    else if (a.length < b.length) { j++; }
    else { i++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}

function matchPort(graph, flat, p) {
  const cfg = graph.config;
  const covered = new Array(p.length).fill(false);
  const hits = [];
  const cover = (s, e) => { for (let k = s; k < e; k++) covered[k] = true; };
  for (const { term, cls, weight } of flat.filter(x => x.phrase)) {
    let idx = p.indexOf(term);
    while (idx !== -1) {
      let overlap = false;
      for (let k = idx; k < idx + term.length; k++) if (covered[k]) { overlap = true; break; }
      if (!overlap) { hits.push({ cls, term, weight, pos: idx, fuzzy: false }); cover(idx, idx + term.length); }
      idx = p.indexOf(term, idx + 1);
    }
  }
  for (const { term, cls, weight } of flat.filter(x => !x.phrase)) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    let m;
    while ((m = re.exec(p)) !== null) {
      let ok = true;
      for (let k = m.index; k < m.index + term.length; k++) if (covered[k]) { ok = false; break; }
      if (ok) { hits.push({ cls, term, weight, pos: m.index, fuzzy: false }); cover(m.index, m.index + term.length); }
    }
  }
  const toks = [];
  const re2 = /\S+/g; let mm;
  while ((mm = re2.exec(p)) !== null) toks.push({ w: mm[0], i: mm.index });
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
      if (editDistance1(word, term)) { hits.push({ cls, term: `${word}~${term}`, weight, pos: t.i, fuzzy: true }); break; }
    }
  }
  const negOffsets = [];
  p.replace(/\S+/g, (w, off) => {
    if (cfg.negation_markers.some(n => w === n || w.endsWith(n))) negOffsets.push(off);
    return w;
  });
  return hits.filter(h => {
    if (h.fuzzy) return true;
    const neg = negOffsets.find(no => no < h.pos && h.pos - no <= 16 &&
      (p.slice(no, h.pos).trim().split(/\s+/).length - 1) <= cfg.negation_window_words);
    return neg === undefined;
  });
}

function wideView(graph) {
  const g = JSON.parse(JSON.stringify(graph));
  g.config.fuzzy_min_term_len = 3;
  g.config.negation_window_words = 4;
  const w = g.config.weights;
  for (const k of Object.keys(w)) w[k] = +(w[k] + 0.5).toFixed(2);
  return g;
}

function routeWithCast(narrow, wide, prompt, useCast, useFallbackV2) {
  const n = scoreAll(narrow.graph, narrow.flat, prompt, useFallbackV2);
  if (!useCast) return { routed: n.best, score: n.score, usedCast: false, nCand: n.nCandidates, wCand: 0, fellBack: n.fellBack };
  const trigger = n.score < 1.5 * narrow.graph.config.route_threshold ||
    (n.sorted.length >= 2 && (n.sorted[0][1] - n.sorted[1][1]) < 0.5);
  if (!trigger) return { routed: n.best, score: n.score, usedCast: false, nCand: n.nCandidates, wCand: 0, fellBack: n.fellBack };
  const wv = scoreAll(wide.graph, wide.flat, prompt, useFallbackV2);
  const wBest = wv.sorted.length ? wv.sorted[0][1] : 0;
  const overtake = wv.best !== n.best && wBest >= n.score + 0.5;
  return { routed: overtake ? wv.best : n.best, score: overtake ? wBest : n.score,
           usedCast: true, nCand: n.nCandidates, wCand: wv.nCandidates, overtake,
           fellBack: n.fellBack || wv.fellBack };
}

function main() {
  if (process.argv.includes("--dump-suite")) {
    const ev0 = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "edge", "eval_prompts.json"), "utf8"));
    const rnd0 = mulberry32(SEED);
    const suite = ev0.prompts.map(pr => ({ id: pr.id, gold: pr.label_class, prompt: degrade(pr.prompt, rnd0), kind: "corr" }));
    const unseen0 = UNSEEN.map(u => ({ id: u.id, gold: u.label_class, prompt: u.prompt, kind: "unseen" }));
    suite.push(...unseen0);
    fs.writeFileSync(path.join(__dirname, "cast_suite.json"), JSON.stringify({ seed: SEED, prompts: suite }, null, 1));
    console.log("suite dumped:", suite.length, "prompts");
    return 0;
  }
  const V2 = process.argv.includes("--v2");
  const graph = loadGraph(path.join(__dirname, "..", "edge", "synonym_graph.json"));
  const flat = flatten(graph);
  const wide = { graph: wideView(graph), flat: null };
  wide.flat = flatten(wide.graph);
  const ev = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "edge", "eval_prompts.json"), "utf8"));

  // parity pin: port top-1 must equal canonical routePrompt on all clean
  let parityFail = 0;
  for (const pr of ev.prompts) {
    const canon = routePrompt(graph, flat, pr.prompt).class;
    const port = scoreAll(graph, flat, pr.prompt, V2).best;
    if (canon !== port) parityFail++;
  }

  // degraded suite (seeded corruption) + unseen rewrites
  const rnd = mulberry32(SEED);
  const degraded = ev.prompts.map(pr => ({
    id: pr.id, gold: pr.label_class, prompt: degrade(pr.prompt, rnd) }));
  const unseen = UNSEEN.map(u => ({ id: u.id, gold: u.label_class, prompt: u.prompt }));
  const suites = { degraded, unseen };
  const allDegraded = degraded.concat(unseen);

  function evalSuite(prompts, useCast) {
    let ok = 0, casts = 0, overtakes = 0, candN = 0, candW = 0, fallbacks = 0;
    const failures = [];
    for (const p of prompts) {
      const r = routeWithCast({ graph, flat }, wide, p.prompt, useCast, V2);
      const good = r.routed === p.gold;
      ok += good ? 1 : 0;
      candN += r.nCand; candW += r.wCand || 0;
      if (r.usedCast) { casts++; if (r.overtake) overtakes++; }
      if (r.fellBack) fallbacks++;
      if (!good) failures.push({ id: p.id, gold: p.gold, routed: r.routed, score: r.score });
    }
    const n = prompts.length;
    return { top1: +(ok / n).toFixed(4), n, casts, overtakes, fallbacks,
             meanCandNarrow: +(candN / n).toFixed(3), meanCandWide: +(candW / n).toFixed(3),
             failures: failures.map(f => f.id) };
  }

  const clean = evalSuite(ev.prompts.map(pr => ({ id: pr.id, gold: pr.label_class, prompt: pr.prompt })), true);
  const degNarrow = evalSuite(allDegraded, false);
  const degCast = evalSuite(allDegraded, true);

  const receipt = {
    seed: SEED, version: V2 ? "cast-v2-zero-evidence-fallback" : "cast-v1-graph-widening",
    parity_port_vs_canonical_clean: { mismatches: parityFail, pass: parityFail === 0 },
    clean_with_cast: clean,
    degraded_narrow_null: degNarrow,
    degraded_cast: degCast,
    delta_cast_vs_narrow_pts: +((degCast.top1 - degNarrow.top1) * 100).toFixed(1),
    h_cast: V2 ? {
      h1_recover_ge_2_of_4: (degNarrow.failures.length - degCast.failures.length) >= 2,
      h2_zero_regressions: degCast.failures.every(f => degNarrow.failures.includes(f)) && clean.top1 === 1.0,
      h3_fallback_fires_le_12: degCast.fallbacks <= 12,
    } : {
      degraded_plus_10pts: (degCast.top1 - degNarrow.top1) >= 0.10,
      clean_stays_perfect: clean.top1 === 1.0,
      wide_candidates_le_3x_narrow: degCast.meanCandWide <= 3 * degCast.meanCandNarrow,
    },
    sample_degraded_first3: allDegraded.slice(0, 3).map(d => ({ id: d.id, prompt: d.prompt })),
  };
  receipt.h_cast.pass = Object.values(receipt.h_cast).every(Boolean);
  receipt.verdict = (parityFail === 0 && receipt.h_cast.pass) ? "PASS" : "FAIL";

  const receiptPath = V2 ? "cast_eval_v2_receipt.json" : "cast_eval_receipt.json";
  fs.writeFileSync(path.join(__dirname, receiptPath), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ version: receipt.version, clean: clean.top1, degNarrow: degNarrow.top1,
    degCast: degCast.top1, delta: receipt.delta_cast_vs_narrow_pts, casts: degCast.casts, overtakes: degCast.overtakes,
    fallbacks: degCast.fallbacks, narrowFailures: degNarrow.failures, castFailures: degCast.failures,
    meanCandNarrow: degCast.meanCandNarrow, meanCandWide: degCast.meanCandWide,
    parity: parityFail, h_cast: receipt.h_cast, verdict: receipt.verdict }, null, 1));
  return receipt.verdict === "PASS" ? 0 : 1;
}

if (require.main === module) process.exit(main());
