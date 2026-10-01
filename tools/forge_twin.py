#!/usr/bin/env python3
"""
SuperInstance Automated Twin Forge.
Single-command packaging: atlas + Cloudflare worker + mobile frontend → dist_twin/.
Zero dependencies. Run: python3 tools/forge_twin.py
"""
import os
import json


def forge_project_infrastructure():
    print("=======================================================================")
    print("STARTING THE AUTOMATED DIGITAL TWIN FORGE")
    print("=======================================================================\n")

    print("[1/4] Structuring local workspace directories...")
    dist = "dist_twin"
    os.makedirs(f"{dist}/cloudflare_edge/src", exist_ok=True)
    os.makedirs(f"{dist}/mobile_frontend/js", exist_ok=True)
    print(f"      Created path targets inside: ./{dist}/")

    print("\n[2/4] Simulating Rust font-rasterizer primitives...")
    # Round 1: simulated 24-bit signatures. Round 2 swaps in real atlas output
    # from the font_atlas_packager crate.
    atlas = [(0x75F652 ^ (i * 1337)) & 0xFFFFFF for i in range(70)]
    print(f"      Packed {len(atlas)} characters into 32-bit registers.")
    print(f"      Example signature: {hex(atlas[4])}")

    print("\n[3/4] Forging Cloudflare Worker route asset...")
    worker_code = '''export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (request.method !== "POST") return new Response("Use POST", { status: 405, headers: corsHeaders });
    try {
      const body = await request.json();
      const prompt = (body.prompt || "").toLowerCase();
      let dials = { contrast: 1.3, blackPoint: 0.15, trailDecay: 0.5, edgePaint: 0.3 };
      if (prompt.includes("woodcut") || prompt.includes("carve")) {
        dials = { contrast: 1.8, blackPoint: 0.40, trailDecay: 0.4, edgePaint: 0.9 };
      } else if (prompt.includes("terminal") || prompt.includes("lo-fi") || prompt.includes("phosphor")) {
        dials = { contrast: 1.4, blackPoint: 0.25, trailDecay: 0.8, edgePaint: 0.1 };
      }
      return new Response(
        JSON.stringify({ status: "MORPH_SUCCESS", active_ledger_delta: dials }),
        { headers: corsHeaders }
      );
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
  }
};'''
    with open(f"{dist}/cloudflare_edge/src/worker.js", "w") as f:
        f.write(worker_code)
    with open(f"{dist}/cloudflare_edge/wrangler.toml", "w") as f:
        f.write('name = "chiaroscuro-edge-bot"\nmain = "src/worker.js"\ncompatibility_date = "2026-09-30"\n')
    print("      Cloudflare deployment code compiled to targets.")

    print("\n[4/4] Forging portable frontend mirror interface...")
    js_atlas = f"const FONT_ATLAS_DATA = new Uint32Array({json.dumps(atlas)});"

    html = """<!DOCTYPE html>
<html>
<head>
<title>SuperInstance Twin Viewfinder</title>
<style>
body{background:#070709;color:#00ff66;font-family:monospace;display:flex;height:100vh;margin:0}
#render-grid{flex:1;display:flex;justify-content:center;align-items:center;white-space:pre;font-size:12px;line-height:12px}
#panel{width:340px;background:#111115;border-left:1px solid #222;padding:25px;box-sizing:border-box}
textarea{width:100%;height:70px;background:#18181f;border:1px solid #333;color:#fff;padding:10px;box-sizing:border-box;resize:none}
button{width:100%;background:transparent;border:1px solid #00ff66;color:#00ff66;padding:10px;margin-top:10px;cursor:pointer}
button:hover{background:#00ff66;color:#000}
</style>
</head>
<body>
<div id="render-grid">Initializing tracking lattice field...</div>
<div id="panel">
<h3>Chiaroscuro Inception</h3>
<textarea id="prompt" placeholder="Type style prompt (e.g. 'heavy woodcut carving')..."></textarea>
<button id="send-btn">Send Nudge</button>
</div>
<script>
__ATLAS__
console.log("Loaded shape-first font registry signatures:", FONT_ATLAS_DATA);
let dials = { contrast: 1.3, blackPoint: 0.15 };
const ramp = " .:-=+*#%@█";
let tick = 0;
setInterval(() => {
  tick += 0.07;
  let out = "";
  for (let y = 0; y < 30; y++) {
    for (let x = 0; x < 60; x++) {
      let v = (Math.sin(x*0.1 + tick) * Math.cos(y*0.15 + tick) + 1) / 2;
      v = Math.pow(v, dials.contrast);
      if (v < dials.blackPoint) v = 0;
      out += ramp[Math.floor(v * (ramp.length - 1))];
    }
    out += "\\n";
  }
  document.getElementById("render-grid").textContent = out;
}, 33);
document.getElementById("send-btn").onclick = async () => {
  const p = document.getElementById("prompt").value;
  if (p.includes("woodcut") || p.includes("carve")) dials = { contrast: 1.9, blackPoint: 0.35 };
  else dials = { contrast: 1.2, blackPoint: 0.10 };
  document.getElementById("prompt").value = "";
};
</script>
</body>
</html>""".replace("__ATLAS__", js_atlas)

    with open(f"{dist}/mobile_frontend/index.html", "w") as f:
        f.write(html)

    print("\n=======================================================================")
    print("SUCCESS: TWIN INFRASTRUCTURE ARCHITECTURE PACKAGED AND LOADED")
    print("=======================================================================")
    print(f" 1. cd ./{dist}/cloudflare_edge/ && wrangler deploy")
    print(f" 2. open ./{dist}/mobile_frontend/index.html in phone or laptop browser")
    print("=======================================================================")


if __name__ == "__main__":
    forge_project_infrastructure()
