#!/usr/bin/env node
// cast_diag.js — failure autopsy for cast_route v1 (read-only, no policy changes).
"use strict";
const fs = require("fs");
const path = require("path");
const receipt = JSON.parse(fs.readFileSync(path.join(__dirname, "cast_eval_receipt.json"), "utf8"));
const { loadGraph, flatten, routePrompt } = require(path.join(__dirname, "..", "edge", "nl_route.js"));
const graph = loadGraph(path.join(__dirname, "..", "edge", "synonym_graph.json"));
const flat = flatten(graph);

// regenerate the same degraded suite (same seed/algorithm as cast_route.js)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function degrade(prompt, rnd) {
  return prompt.split(" ").map(w => {
    if (w.length < 4 || rnd() >= 0.15) return w;
    const chars = w.split("");
    const i = 1 + Math.floor(rnd() * (chars.length - 2));
    if (rnd() < 0.5 && chars.length > 4) chars.splice(i, 1);
    else { const j = 1 + Math.floor(rnd() * (chars.length - 2)); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    return chars.join("");
  }).join(" ");
}
const ev = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "edge", "eval_prompts.json"), "utf8"));
const rnd = mulberry32(20261001);
const all = ev.prompts.map(pr => ({ id: pr.id, gold: pr.label_class, prompt: degrade(pr.prompt, rnd), kind: "corr" }));
const UNSEEN = [
  ["un01", "chisel-cut relief print aesthetic", "woodcut"], ["un02", "block printed poster with heavy ink", "woodcut"],
  ["un03", "green monochrome command line feel", "terminal"], ["un04", " phosphor terminal typing vibes", "terminal"],
  ["un05", "gentle diffused morning light look", "soft"], ["un06", "feathered airy delicate rendering", "soft"],
  ["un07", "brutalist razor edge contrast", "harsh"], ["un08", "searing overexposed stark finish", "harsh"],
].map(u => ({ id: u[0], gold: u[2], prompt: u[1], kind: "unseen" }));
all.push(...UNSEEN);

for (const p of all) {
  const r = routePrompt(graph, flat, p.prompt);
  if (r.class !== p.gold) {
    console.log(JSON.stringify({ id: p.id, kind: p.kind, gold: p.gold, routed: r.class,
      score: r.score, hits: r.hits, prompt: p.prompt }));
  }
}
