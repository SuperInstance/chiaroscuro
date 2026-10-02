// =====================================================================
// nl_route_core.mjs — ESM port of the canonical synonym-graph router
// (edge/nl_route.js, measured 50/50 on the pre-registered eval set,
// tools/edge_graph_receipt.json). Consumed by edge/worker.ts (the
// production Cloudflare Worker) and pinned to the reference by
// tools/nl_parity.mjs — two implementations, one behavior.
// Zero deps. Framework-free (no fs, no process): data arrives via import.
// =====================================================================
import { GRAPH, GRAPH_SHA256 } from "./synonym_graph.mjs";

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

function tokenize(prompt) {
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
  const cover = (s, e) => { for (let k = s; k < e; k++) covered[k] = true; };

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

function routePrompt(graph, flat, prompt) {
  const cfg = graph.config;
  const p = (prompt || "").toLowerCase();
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

  const cls = best || "default";
  return {
    class: cls,
    dials: (graph.classes[cls] || {}).dials || graph.default_dials,
    score: best ? scores[best] : 0,
    hits: hits.map(h => `${h.cls}:${h.term}${h.fuzzy ? "(fuzzy)" : ""}@${h.pos}`),
  };
}

export function makeRouter(graph = GRAPH) {
  const flat = flatten(graph);
  return {
    graph,
    graphSha256: GRAPH_SHA256,
    route: (prompt) => routePrompt(graph, flat, prompt),
  };
}

export { routePrompt, flatten, GRAPH, GRAPH_SHA256 };
