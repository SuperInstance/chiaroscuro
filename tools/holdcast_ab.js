// holdcast_ab.js — JEV v2 HOLD/CAST A/B runner (docs/HOLDCAST-pre-registration.md).
// Compares v1 router (CAST disabled) vs v2 (CAST widening) on the clean pinned
// suite + a deterministic seeded degraded suite, measures wall-clock, and pins
// the jev_gate.js abstain-mode register (H3). Zero deps. Node >= 18.
// Usage: node tools/holdcast_ab.js
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const here = __dirname;
const root = path.join(here, "..");
const { loadGraph, flatten, routePrompt } = require(path.join(root, "edge", "nl_route.js"));

// --- deterministic PRNG (mulberry32), seeded per pre-registration ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEGRADE_SEED = 20261001; // pre-registered

// distance-2 typo: two single-edit mutations on distinct letters
function degradeTypo(rng, s) {
  const chars = s.split("");
  const idxs = [...chars.keys()].filter(i => /[a-z]/.test(chars[i]));
  if (idxs.length === 0) return s;
  for (let k = 0; k < 2; k++) {
    const i = idxs[Math.floor(rng() * idxs.length)];
    const c = chars[i];
    if (rng() < 0.5) chars[i] = String.fromCharCode(97 + Math.floor(rng() * 26)); // substitute
    else chars[i] = c + String.fromCharCode(97 + Math.floor(rng() * 26));          // insert
  }
  return chars.join("");
}

// unseen phrasing: drop function words (deterministic positions)
const FUNCTION_WORDS = new Set(["a", "an", "the", "it", "like", "look", "make", "into", "i", "want", "please", "my", "this", "that"]);
function degradeDrop(rng, s) {
  const words = s.split(/\s+/);
  const drop = new Set();
  const candidates = words.map((w, i) => [w.toLowerCase().replace(/[^a-z]/g, ""), i]).filter(([w]) => FUNCTION_WORDS.has(w));
  for (const [, i] of candidates) if (rng() < 0.6) drop.add(i);
  return words.filter((_, i) => !drop.has(i)).join(" ") || s;
}

function sha256(p) { return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); }

function scoreSuite(graph, flat, prompts, opts) {
  let correct = 0, casts = 0;
  const t0 = process.hrtime.bigint();
  for (const p of prompts) {
    const r = routePrompt(graph, flat, p.prompt, opts);
    if (r.cast) casts++;
    if (r.class === p.label_class) correct++;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { top1: correct / prompts.length, correct, n: prompts.length, ms, casts };
}

// --- H3: jev_gate abstain-mode register pins --------------------------------
function gatePins() {
  const { JevGate } = require(path.join(root, "js", "jev_gate.js"));
  const g = new JevGate(4, { castWindow: 4 });
  const out = [];
  // frame 1: cell 0 sees value (luma jump) -> psi=+1
  g.update(0, 24);
  // frames 2..6: static -> abstain every frame; belief EMA of |d| decays below floor
  let modes = [];
  for (let f = 0; f < 6; f++) {
    const cls = g.update(0, 24); // d=0 -> abstain (first sight set prev)
    if (cls === -1) modes.push(g.abstainMode(0));
  }
  // belief starts 0, stays < floor 0.10 -> CAST immediately (cooldown pre-elapsed),
  // then HOLD for the next castWindow-1 abstain frames
  out.push(["cast_first_eligible", modes[0] === 1, JSON.stringify(modes)]);
  out.push(["cooldown_holds", modes.slice(1, 4).every(m => m === 0), JSON.stringify(modes)]);
  // after window (4 holds elapsed), CAST again (belief still below floor)
  out.push(["cast_after_window", modes[5] === 1, JSON.stringify(modes)]);
  out.push(["counters", g.casts === 2 && g.holds >= 3, `casts=${g.casts} holds=${g.holds}`]);
  // rejection register: markRejected makes next abstain CAST-eligible
  const g2 = new JevGate(1, { castWindow: 4 });
  g2.update(0, 24);
  for (let f = 0; f < 3; f++) g2.update(0, 24); // burn 3 abstain frames, cooldown now 3
  g2.markRejected(0);
  const m1 = g2.abstainMode(0);
  out.push(["rejection_casts", m1 === 1, `mode=${m1}`]);
  // v1 compatibility: abstainMode absent on old gate -> FAIL-first shape check
  out.push(["api_present", typeof g2.abstainMode === "function" && typeof g2.markRejected === "function", ""]);
  return out;
}

function main() {
  const graph = loadGraph(path.join(root, "edge", "synonym_graph.json"));
  const flat = flatten(graph);
  const clean = JSON.parse(fs.readFileSync(path.join(root, "edge", "eval_prompts.json"), "utf8"));

  // degraded suite (seeded, deterministic) — generated BEFORE scoring, fixed seed
  const rng = mulberry32(DEGRADE_SEED);
  const degraded = [];
  for (const p of clean.prompts) {
    degraded.push({ id: p.id + "-d1", prompt: degradeTypo(rng, p.prompt), label_class: p.label_class, deg: "typo2" });
    degraded.push({ id: p.id + "-d2", prompt: degradeDrop(rng, p.prompt), label_class: p.label_class, deg: "drop" });
  }

  const v1 = { castWidening: false };
  const v2 = { castWidening: true };
  const R = { clean: {}, degraded: {} };
  for (const [k, suite] of [["clean", clean.prompts], ["degraded", degraded]]) {
    R[k].v1 = scoreSuite(graph, flat, suite, v1);
    R[k].v2 = scoreSuite(graph, flat, suite, v2);
  }
  const pins = gatePins();

  const delta = R.degraded.v2.top1 - R.degraded.v1.top1;
  const clockRatio = R.clean.v2.ms / Math.max(R.clean.v1.ms, 1e-9);
  const h1 = +(delta.toFixed(4)) >= 0.10; // rounded to receipt precision (0.97-0.87 fp guard)
  const h2 = R.clean.v2.correct === R.clean.v2.n && clockRatio <= 1.05;
  const h3 = pins.every(([name, ok]) => ok);

  console.log("clean    v1 " + R.clean.v1.correct + "/" + R.clean.v1.n + "  v2 " + R.clean.v2.correct + "/" + R.clean.v2.n +
    "  clock v1=" + R.clean.v1.ms.toFixed(1) + "ms v2=" + R.clean.v2.ms.toFixed(1) + "ms ratio=" + clockRatio.toFixed(3));
  console.log("degraded v1 " + R.degraded.v1.correct + "/" + R.degraded.v1.n + " (" + R.degraded.v1.top1.toFixed(3) + ")  v2 " +
    R.degraded.v2.correct + "/" + R.degraded.v2.n + " (" + R.degraded.v2.top1.toFixed(3) + ")  casts=" + R.degraded.v2.casts +
    "  delta=" + (delta >= 0 ? "+" : "") + delta.toFixed(3));
  for (const [name, ok, detail] of pins) console.log("  pin " + name + " " + (ok ? "PASS" : "FAIL") + " " + detail);
  console.log("H1 (+>=10pts degraded): " + (h1 ? "MET" : "NOT MET"));
  console.log("H2 (clean 50/50, <=5% clock): " + (h2 ? "MET" : "NOT MET"));
  console.log("H3 (gate register pins): " + (h3 ? "MET" : "NOT MET"));

  const receipt = {
    pre_registration: "docs/HOLDCAST-pre-registration.md",
    degrade_seed: DEGRADE_SEED,
    input_sha256: {
      "edge/eval_prompts.json": sha256(path.join(root, "edge", "eval_prompts.json")),
      "edge/synonym_graph.json": sha256(path.join(root, "edge", "synonym_graph.json")),
      "edge/nl_route.js": sha256(path.join(root, "edge", "nl_route.js")),
      "js/jev_gate.js": sha256(path.join(root, "js", "jev_gate.js")),
    },
    clean: R.clean, degraded: R.degraded,
    delta_degraded_top1: +delta.toFixed(4),
    clock_ratio_clean: +clockRatio.toFixed(4),
    hypotheses: { H1_recovered_10pts: h1, H2_clean_intact_5pct_clock: h2, H3_gate_pins: h3 },
    verdict: h1 && h2 && h3 ? "INTEGRATE" : "FAIL",
    date: "2026-10-01",
  };
  fs.writeFileSync(path.join(here, "holdcast_ab_receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log("receipt -> tools/holdcast_ab_receipt.json  verdict=" + receipt.verdict);
  process.exit(h1 && h2 && h3 ? 0 : 1);
}

main();
