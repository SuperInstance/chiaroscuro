// =====================================================================
// CHIAROSCURO EDGE BOT — Cloudflare Worker
// Natural language → dial delta. ONE namespace for context fields (R5):
// the request JSON body is the only scope; dial fields resolve here only.
//
// Pairs with the five doors: POST a prompt, get active_ledger_delta,
// apply to the engine's dial set.
// =====================================================================

export interface Env {}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

const DEFAULT_DIALS = {
  contrast: 1.3,
  blackPoint: 0.15,
  trailDecay: 0.5,
  edgePaint: 0.3,
};

// EVAL SET: edge/eval_prompts.json (50 prompts, pre-registered R2).
// Mirror in edge/score_eval.py RULES — update both.
// Measured 2026-10-01: overall top-1 = 0.560 (tools/edge_eval_receipt.json).
// Keyword table — Round 3 replaces with a bounded mapping model.
// Each entry: [trigger words, dial delta].
const STYLE_RULES: [string[], Partial<typeof DEFAULT_DIALS>][] = [
  [["woodcut", "carve", "engraving"], { contrast: 1.8, blackPoint: 0.40, trailDecay: 0.4, edgePaint: 0.9 }],
  [["terminal", "lo-fi", "phosphor", "retro"], { contrast: 1.4, blackPoint: 0.25, trailDecay: 0.8, edgePaint: 0.1 }],
  [["soft", "ambient", "fog"], { contrast: 0.9, blackPoint: 0.05, trailDecay: 0.9, edgePaint: 0.0 }],
  [["harsh", "noir", "hard"], { contrast: 2.1, blackPoint: 0.50, trailDecay: 0.2, edgePaint: 1.0 }],
];

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") {
      return new Response("Use POST", { status: 405, headers: CORS });
    }
    try {
      const body = (await request.json()) as { prompt?: string };
      const prompt = (body.prompt || "").toLowerCase();

      let dials = { ...DEFAULT_DIALS };
      for (const [words, delta] of STYLE_RULES) {
        if (words.some(w => prompt.includes(w))) {
          dials = { ...dials, ...delta };
          break; // first match wins; deterministic
        }
      }

      return new Response(
        JSON.stringify({ status: "MORPH_SUCCESS", active_ledger_delta: dials }),
        { headers: CORS }
      );
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS });
    }
  },
};
