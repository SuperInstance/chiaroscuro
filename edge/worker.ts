// =====================================================================
// CHIAROSCURO EDGE BOT — Cloudflare Worker
// Natural language → dial delta. ONE namespace for context fields (R5):
// the request JSON body is the only scope; dial fields resolve here only.
//
// Pairs with the five doors: POST a prompt, get active_ledger_delta,
// apply to the engine's dial set.
// =====================================================================

export interface Env {}

import { makeRouter } from "./nl_route_core.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

// EVAL SET: edge/eval_prompts.json (50 prompts, pre-registered R2).
// Measured 2026-10-01: keyword table 0.560 (tools/edge_eval_receipt.json);
// synonym-graph router 50/50 (tools/edge_graph_receipt.json).
// The worker routes through the SAME graph router as edge/nl_route.js —
// two implementations, one behavior, pinned by tools/nl_parity.mjs.
// default fallback dials come from the graph itself (graph.default_dials).
const router = makeRouter();

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") {
      return new Response("Use POST", { status: 405, headers: CORS });
    }
    try {
      const body = (await request.json()) as { prompt?: string };
      const r = router.route(body.prompt || "");
      const dials = { ...r.dials };

      return new Response(
        JSON.stringify({ status: "MORPH_SUCCESS", active_ledger_delta: dials }),
        { headers: CORS }
      );
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
    }
  },
};
