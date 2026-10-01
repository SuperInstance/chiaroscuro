// =====================================================================
// CHIAROSCURO EDGE BOT — Cloudflare Worker
// Natural language → dial delta. ONE namespace for context fields (R5):
// the request JSON body is the only scope; dial fields resolve here only.
//
// Pairs with the five doors: POST a prompt, get active_ledger_delta,
// apply to the engine's dial set.
//
// ROUTER: synonym-graph mirror of edge/nl_route.js (canonical, node).
// Data: edge/synonym_graph.json — SINGLE SOURCE OF TRUTH, imported here
// directly so data parity is structural, not copied. Routing-behavior
// parity vs the canonical router is pinned by tools/nl_parity.js over
// the pinned 50-prompt eval set (edge/eval_prompts.json).
// =====================================================================

import graphJson from "./synonym_graph.json" with { type: "json" };

export interface Env {}

type DialSet = { contrast: number; blackPoint: number; trailDecay: number; edgePaint: number };
type Graph = typeof graphJson;
type FlatTerm = { term: string; cls: string; weight: number; phrase: boolean };
type Hit = { cls: string; term: string; weight: number; pos: number; fuzzy: boolean };

const GRAPH = graphJson as Graph;
const FLAT = flatten(GRAPH);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

// ---- synonym-graph router: TS mirror of edge/nl_route.js -------------
// Keep semantically identical to the canonical router; tools/nl_parity.js
// pins class+dials+score+hits equal across all 50 eval prompts.

function flatten(graph: Graph): FlatTerm[] {
  const out: FlatTerm[] = [];
  const w = graph.config.weights;
  for (const [cls, body] of Object.entries(graph.classes)) {
    for (const [band, terms] of Object.entries(body.terms)) {
      for (const t of terms) {
        out.push({ term: t, cls, weight: w[band as keyof typeof w], phrase: t.includes(" ") });
      }
    }
  }
  out.sort((a, b) => b.term.length - a.term.length); // phrase/longest first
  return out;
}

function editDistance1(a: string, b: string): boolean {
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

function tokenize(prompt: string): { w: string; i: number }[] {
  const toks: { w: string; i: number }[] = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(prompt)) !== null) toks.push({ w: m[0], i: m.index });
  return toks;
}

function match(graph: Graph, flat: FlatTerm[], prompt: string): Hit[] {
  const p = prompt.toLowerCase();
  const toks = tokenize(p);
  const covered = new Array(p.length).fill(false);
  const hits: Hit[] = [];
  const cover = (s: number, e: number) => { for (let k = s; k < e; k++) covered[k] = true; };

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

// Exported for tools/nl_parity.js: same contract as the canonical
// routePrompt(graph, flat, prompt), minus the pre-flattened argument
// (this module flattens its imported graph at load time).
export function routePrompt(graph: Graph, prompt: string) {
  const cfg = graph.config;
  const p = prompt.toLowerCase();
  let hits = match(graph, FLAT, p);

  // intent-position: negation window suppresses the matched term
  const toks = tokenize(p);
  const negOffsets: number[] = [];
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
  const trailingClasses = new Set<string>();
  if (pivot !== -1) {
    for (const h of hits) if (h.pos > pivot) trailingClasses.add(h.cls);
  }

  // score
  const scores: Record<string, number> = {};
  const firstPos: Record<string, number> = {};
  for (const h of hits) {
    let w = h.weight;
    if (pivot !== -1 && h.pos > pivot && trailingClasses.size > 0) w *= cfg.but_pivot_multiplier;
    scores[h.cls] = (scores[h.cls] || 0) + w;
    if (!(h.cls in firstPos) || h.pos < firstPos[h.cls]) firstPos[h.cls] = h.pos;
  }

  let candidates = Object.keys(scores);
  if (trailingClasses.size > 0) candidates = candidates.filter(c => trailingClasses.has(c));

  let best: string | null = null;
  for (const c of candidates) {
    if (scores[c] < cfg.route_threshold) continue;
    if (best === null) { best = c; continue; }
    if (scores[c] > scores[best]) best = c;
    else if (scores[c] === scores[best] && firstPos[c] < firstPos[best]) best = c; // pre-registered tiebreak
  }

  const cls = best || "default";
  return {
    class: cls,
    dials: ((graph.classes as Record<string, { dials?: DialSet }>)[cls] || {}).dials || graph.default_dials,
    score: best ? scores[best] : 0,
    hits: hits.map(h => `${h.cls}:${h.term}${h.fuzzy ? "(fuzzy)" : ""}@${h.pos}`),
  };
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") {
      return new Response("Use POST", { status: 405, headers: CORS });
    }
    try {
      const body = (await request.json()) as { prompt?: string };
      const routed = routePrompt(GRAPH, body.prompt || "");

      return new Response(
        JSON.stringify({
          status: "MORPH_SUCCESS",
          active_ledger_delta: routed.dials,
          routed_class: routed.class,
          route_score: routed.score,
          route_hits: routed.hits,
        }),
        { headers: CORS }
      );
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
    }
  },
};
