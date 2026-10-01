#!/usr/bin/env node
// ============================================================================
// port-video.mjs — the Studio, carried out of the browser and into a file.
//
// chiaroscuro renders live cameras; this tool renders recorded light. Same
// pipeline, same dials, same five engines (plus the Sculptor's, plus the
// porter's own): ffmpeg decodes the frames, pure Node turns each one into
// text, and the parameter manifest rides alongside as the record of the port.
//
//   node port-video.mjs <input.mp4|webm|mov> [flags]
//
// Zero npm dependencies. Node >= 20. ffmpeg is spawned in list form only —
// no shell strings anywhere (fleet rule). Everything fails loud: unknown
// flags list the whole surface, ffmpeg stderr is passed through, extracted
// vs rendered frame counts are always printed and never allowed to drift.
//
// The honest ledger for this file (see repo README, "Honest ledger"):
//   - halftone is APPROXIMATED in text: the Studio draws real circles with
//     real radii; a character cell can only carry dot-density glyphs
//     " ·∙•●". Ink quantity, not geometry.
//   - shapematch templates are hand-drawn 4×6 bitmaps for a curated alphabet
//     (the Studio rasterizes its live typeface; offline Node has no font
//     rasterizer without deps). Hamming election is unchanged.
//   - typefaces ride along as CSS in html output only; txt/ans use whatever
//     the terminal brings. The manifest records the choice either way.
//   - pixel engine in txt mode (no color channel) falls back to " ▀▄█".
// ============================================================================

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TOOL = 'port-video';

// ---------------------------------------------------------------------------
// The dial surface. Every entry is a named dial with a type, a default, and
// a one-line help. The Studio has forty-five; the porter carries more,
// because a porter also has to know about time and filing.
// ---------------------------------------------------------------------------

const RAMPS = {
  classic: ' .:-=+*#%@@',                                            // the Original, double-@ and all
  fine:    " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$", // 70 levels nobody can name
  blocks:  ' ░▒▓█',
  minimal: ' .:*#',
  stars:   '·∴∗✦✱✳❋█',
  runes:   '·ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ█',
  binary:  ' 01',
  code:    ' {}[]()<>/\\|=+*',
  waves:   '·≈≋▒▓█',
};

const HALFTONE_RAMP = ' ·∙•●'; // dot-density approximation of ink circles

const FONTS = {
  courier: 'Courier New', lucida: 'Lucida Console', consolas: 'Consolas',
  dejavu: 'DejaVu Sans Mono', monospace: 'monospace', menlo: 'Menlo',
  monaco: 'Monaco', andale: 'Andale Mono', liberation: 'Liberation Mono',
  serif: 'Georgia', impact: 'Impact', comic: 'Comic Sans MS',
};

const DIALS = {
  // -- grid & glyphs ---------------------------------------------------------
  cols:          { type: 'int',   def: 100, min: 16, max: 1000, help: 'character columns (default 100)' },
  rows:          { type: 'int',   def: 0,  min: 0,  max: 1000, help: 'character rows (0 = derived from aspect × cellAspect)' },
  cellAspect:    { type: 'float', def: 0.6, min: 0.2, max: 2,   help: 'font metrics note: terminal cells are ~0.6 as wide as tall; rows derive through this' },
  maxCols:       { type: 'int',   def: 400, min: 16, max: 1000, help: 'hard ceiling on cols after derivation' },
  maxRows:       { type: 'int',   def: 200, min: 4,  max: 1000, help: 'hard ceiling on rows after derivation' },
  glyphRamp:     { type: 'enum',  def: 'classic', enum: [...Object.keys(RAMPS)], help: 'tone ramp: classic|fine|blocks|minimal|stars|runes|binary|code|waves' },
  customRamp:    { type: 'str',   def: '',   help: 'literal ramp string, light→heavy ink; overrides glyphRamp when non-empty' },
  glyphScale:    { type: 'float', def: 1, min: 0.2, max: 8,     help: 'html only: font-size scale on the frame <pre>' },
  glyphOffsetX:  { type: 'float', def: 0, min: -50, max: 50,    help: 'html only: horizontal offset in ch units' },
  glyphOffsetY:  { type: 'float', def: 0, min: -50, max: 50,    help: 'html only: vertical offset in em units' },
  font:          { type: 'str',   def: 'courier', help: 'html only: typeface (rides as CSS; txt/ans use the terminal’s own)' },
  // -- image -----------------------------------------------------------------
  blackPoint:    { type: 'float', def: 0,   min: 0, max: 1,     help: 'levels: lum below this clamps to black (0..1)' },
  whitePoint:    { type: 'float', def: 1,   min: 0, max: 1,     help: 'levels: lum above this clamps to white (0..1)' },
  gamma:         { type: 'float', def: 1,   min: 0.1, max: 5,   help: 'midtone response, v^(1/g) — 1 neutral, >1 lifts mids' },
  contrast:      { type: 'float', def: 0,   min: -1, max: 1,    help: 'spread around midgray (±1)' },
  brightness:    { type: 'float', def: 0,   min: -1, max: 1,    help: 'additive lift (±1)' },
  posterize:     { type: 'int',   def: 0,   min: 0, max: 64,    help: 'quantize lum to N levels (0 = off, ≥2 meaningful)' },
  dotGain:       { type: 'float', def: 50,  min: 0, max: 100,   help: 'press dot gain: 50 neutral, >50 darkens midtones (dots grow), <50 lightens' },
  dither:        { type: 'enum',  def: 'none', enum: ['none', 'floyd', 'bayer4'], help: 'dither before ramp quantization: none|floyd (FS error diffusion)|bayer4 (ordered)' },
  invert:        { type: 'bool',  def: false, help: 'invert tone (the Ink & Paper move)' },
  // -- sculpt ----------------------------------------------------------------
  edgeDetector:  { type: 'enum',  def: 'sobel', enum: ['sobel', 'emboss', 'laplacian', 'none'], help: 'gradient kernel for the relief' },
  edgeThreshold: { type: 'float', def: 0.1, min: 0, max: 1,     help: 'normalized gradient magnitude below which a cell is flat tone (0..1)' },
  edgeMix:       { type: 'float', def: -1,  min: 0, max: 1,     help: 'scales gradient magnitude: 0 pure tone, 1 full relief (default 1 for --engine sculpt, 0 otherwise)' },
  edgePaint:     { type: 'enum',  def: 'source', enum: ['source', 'white', 'black'], help: 'stroke color for edge glyphs' },
  lightAngle:    { type: 'float', def: 315, min: 0, max: 360,   help: 'virtual light source heading in degrees (0 = right, 90 = down)' },
  lightStrength: { type: 'float', def: 0.55, min: 0, max: 1,    help: 'emboss strength of the light on relief strokes' },
  varianceBlend: { type: 'float', def: 0,   min: 0, max: 1,     help: 'Sculptor move: high-variance patches dissolve into braille (continuous, caps at 75th pct)' },
  brailleBlend:  { type: 'float', def: 0,   min: 0, max: 100,   help: 'percent of highest-variance cells rendered as braille subpixels' },
  // -- color -----------------------------------------------------------------
  colorMode:     { type: 'enum',  def: 'passthrough', enum: ['passthrough', 'original', 'phosphor', 'duotone', 'heatmap', 'ink'], help: 'cell color strategy ("original" = Studio alias for passthrough)' },
  phosphorHue:   { type: 'float', def: 120, min: 0, max: 360,   help: 'phosphor hue in degrees (120 green, 36 amber)' },
  duotoneDark:   { type: 'hex',   def: '#0a1030', help: 'duotone shadow color' },
  duotoneLight:  { type: 'hex',   def: '#ffd166', help: 'duotone highlight color' },
  bgCol:         { type: 'hex',   def: '#050507', help: 'html page background' },
  tempShift:     { type: 'float', def: 0,   min: -100, max: 100, help: 'color temperature: + warms (red up, blue down), − cools' },
  saturation:    { type: 'float', def: 100, min: 0, max: 300,   help: 'saturation percent (100 neutral)' },
  vibrance:      { type: 'float', def: 0,   min: 0, max: 100,   help: 'saturation boost weighted toward already-muted pixels' },
  // -- motion & time ---------------------------------------------------------
  trails:        { type: 'float', def: 0,   min: 0, max: 1,     help: 'phosphor persistence: decay of previous frame lum (1 = forever)' },
  temporalBlend: { type: 'float', def: 0,   min: 0, max: 1,     help: 'blend each frame with the previous (temporal smoothing)' },
  glitch:        { type: 'float', def: 0,   min: 0, max: 1,     help: 'glitch amount (0 = off)' },
  glitchRate:    { type: 'float', def: 0.2, min: 0, max: 1,     help: 'probability a frame tears' },
  glitchIntensity:{ type: 'float', def: 4,  min: 1, max: 60,    help: 'max horizontal shift of a torn band, in cells' },
  // -- atmosphere ------------------------------------------------------------
  scanlines:     { type: 'float', def: 0,   min: 0, max: 1,     help: 'darken alternate rows' },
  grain:         { type: 'float', def: 0,   min: 0, max: 1,     help: 'per-cell noise' },
  vignette:      { type: 'float', def: 0,   min: 0, max: 1,     help: 'radial falloff toward the corners' },
  bloom:         { type: 'float', def: 0,   min: 0, max: 1,     help: 'blurred highlights added back' },
  kaleidoscope:  { type: 'float', def: 0,   min: 0, max: 8,     help: 'fold: 0 off, ≥2 mirror horizontally, ≥4 also vertically' },
  zoom:          { type: 'float', def: 1,   min: 1, max: 8,     help: 'center crop factor applied before sampling' },
  // -- porter: time, filing, and the way out ---------------------------------
  engine:        { type: 'enum',  def: 'glyph', enum: ['glyph', 'sculpt', 'pixel', 'braille', 'shapematch', 'halftone'], help: 'engine: glyph|sculpt|pixel|braille|shapematch|halftone' },
  fps:           { type: 'float', def: 0,   min: 0, max: 120,   help: 'sampling frames per second (0 = native)' },
  seek:          { type: 'float', def: 0,   min: 0, max: 1e6,   help: 'start time in seconds' },
  duration:      { type: 'float', def: 0,   min: 0, max: 1e6,   help: 'seconds to take (0 = to end of file)' },
  frameRange:    { type: 'str',   def: '',   help: 'render only these extracted frames, zero-based: "5" or "10-40" or "30-"' },
  out:           { type: 'str',   def: '',   help: 'output path ("-" = stdout); format inferred from .txt/.ans/.html' },
  format:        { type: 'enum',  def: '',   enum: ['', 'txt', 'ans', 'html'], help: 'output format override: txt (plain) | ans (ANSI truecolor) | html (self-contained)' },
  mirror:        { type: 'bool',  def: false, help: 'flip horizontally (the selfie register)' },
  manifest:      { type: 'bool',  def: false, help: 'write <out>.manifest.json sidecar — the parameter manifest IS the record of the port' },
  params:        { type: 'str',   def: '',   help: 'params.json override; JSON wins over flags' },
};

// ---------------------------------------------------------------------------
// small utilities
// ---------------------------------------------------------------------------

const cl01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const fail = (msg, code = 1) => { console.error(`\n${TOOL}: ${msg}`); process.exit(code); };
const log = (msg) => console.error(msg);

function coerce(spec, key, val) {
  if (spec.type === 'bool') return val === 'false' ? false : true;
  if (spec.type === 'int' || spec.type === 'float') {
    const n = spec.type === 'int' ? Number.parseInt(val, 10) : Number.parseFloat(val);
    if (!Number.isFinite(n)) fail(`--${key} expects a number, got "${val}"`, 2);
    if (spec.min !== undefined && n < spec.min) fail(`--${key} must be ≥ ${spec.min} (got ${n})`, 2);
    if (spec.max !== undefined && n > spec.max) fail(`--${key} must be ≤ ${spec.max} (got ${n})`, 2);
    return n;
  }
  if (spec.type === 'enum') {
    if (!spec.enum.includes(val)) fail(`--${key} must be one of: ${spec.enum.filter((e) => e).join(' | ')} (got "${val}")`, 2);
    return val;
  }
  if (spec.type === 'hex') {
    if (!/^#[0-9a-fA-F]{6}$/.test(val)) fail(`--${key} expects a #rrggbb hex color (got "${val}")`, 2);
    return val.toLowerCase();
  }
  return String(val);
}

function flagTable() {
  const lines = ['supported flags:'];
  for (const [k, s] of Object.entries(DIALS)) {
    const d = s.type === 'bool' ? '' : s.type === 'enum' ? ` <${s.enum.filter((e) => e).join('|')}>` : ` <${s.type}>`;
    lines.push(`  --${k}${d}  —  ${s.help}`);
  }
  lines.push('  --help | -h');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// argument parsing — flags first, then params.json on top (JSON wins)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const cfg = {}; const userSet = new Set(); const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { console.error(usage()); process.exit(0); }
    if (!a.startsWith('--')) { positional.push(a); continue; }
    const eq = a.indexOf('=');
    const key = eq >= 0 ? a.slice(2, eq) : a.slice(2);
    let val = eq >= 0 ? a.slice(eq + 1) : undefined;
    const spec = DIALS[key];
    if (!spec) fail(`unknown flag "--${key}"\n\n${flagTable()}`, 2);
    if (spec.type === 'bool') { cfg[key] = val !== undefined ? val !== 'false' : true; }
    else if (val !== undefined) { cfg[key] = coerce(spec, key, val); }
    else {
      const nx = argv[i + 1];
      if (nx === undefined || (nx.startsWith('--') && !/^--?\d/.test(nx))) {
        fail(`--${key} expects a value\n\n${flagTable()}`, 2);
      }
      cfg[key] = coerce(spec, key, nx); i++;
    }
    userSet.add(key);
  }
  return { cfg, userSet, positional };
}

function applyParams(cfg, userSet) {
  if (!cfg.params) return;
  let raw;
  try { raw = fs.readFileSync(cfg.params, 'utf8'); } catch (e) { fail(`cannot read --params ${cfg.params}: ${e.message}`); }
  let obj;
  try { obj = JSON.parse(raw); } catch (e) { fail(`--params ${cfg.params} is not valid JSON: ${e.message}`); }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) fail(`--params must be a JSON object of dials`);
  for (const [k, v] of Object.entries(obj)) {
    const spec = DIALS[k];
    if (!spec) fail(`params.json sets unknown dial "${k}"\n\n${flagTable()}`, 2);
    if (typeof v === 'boolean' && spec.type === 'bool') cfg[k] = v;
    else cfg[k] = coerce(spec, k, String(v));
    userSet.add(k);
  }
  log(`⟩ params: ${cfg.params} applied (JSON wins over flags)`);
}

function usage() {
  return `
port-video.mjs — the chiaroscuro Studio as an offline video→ASCII porter.

  node port-video.mjs <input.mp4|webm|mov> [flags]

Engines (README §6): glyph (ramp by luminance, 1890s weights 0.299/0.587/0.114),
sculpt (Sobel angle → ─╱│╲, magnitude → weight, virtual light emboss),
pixel (▀ half-blocks, two rows per cell, truecolor), braille (U+2800 + bitmask
over a 2×4 patch), shapematch (4×6 template bitmaps, Hamming election),
halftone (dot-density approximation — see honest notes in the source).

${flagTable()}

Output formats: txt (plain characters, blank line between frames),
ans (ANSI truecolor), html (self-contained, charset + CSS + colored <pre> blocks).
Manifest schema: chiaroscuro-port/v1 — every dial, resolved.`;
}

// ---------------------------------------------------------------------------
// binary resolution — ffmpeg allowed, shells are not
// ---------------------------------------------------------------------------

function resolveBin(name, envVar) {
  const home = os.homedir();
  const candidates = [
    process.env[envVar],
    name,
    path.join(home, '.local', 'bin', name),
    path.join(home, 'scratch', name),
    path.join(home, 'scratch', 'ffmpeg', name), // static-build layout
  ].filter(Boolean);
  for (const bin of candidates) {
    try {
      const r = spawnSync(bin, ['-version'], { timeout: 8000, encoding: 'utf8' });
      if (r.status === 0) return bin;
    } catch { /* try next */ }
  }
  return null;
}

function runCapture(bin, args) {
  return new Promise((resolve) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => resolve({ error: e, out, err }));
    p.on('close', (code) => resolve({ code, out, err }));
  });
}

// ---------------------------------------------------------------------------
// probe — dimensions, native fps, duration
// ---------------------------------------------------------------------------

async function probe(input, bins) {
  if (bins.ffprobe) {
    const r = await runCapture(bins.ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input]);
    if (r.code === 0 && r.out) {
      try {
        const j = JSON.parse(r.out);
        const v = (j.streams || []).find((s) => s.codec_type === 'video');
        if (!v || !v.width) throw new Error('no video stream found');
        const [n, d] = String(v.avg_frame_rate || v.r_frame_rate || '25/1').split('/').map(Number);
        const fps = d ? n / d : 25;
        return {
          width: v.width, height: v.height, fps: Number.isFinite(fps) && fps > 0 ? fps : 25,
          duration: Number.parseFloat(j.format?.duration || '0') || 0,
        };
      } catch (e) { /* fall through to ffmpeg parse */ }
    }
  }
  // fallback: let ffmpeg complain, then read its mind
  const r = await runCapture(bins.ffmpeg, ['-hide_banner', '-i', input]);
  const err = r.err || '';
  const dim = err.match(/,\s(\d{2,5})x(\d{2,5})[,\s]/);
  const fps = err.match(/([\d.]+)\sfps/);
  const dur = err.match(/Duration:\s(\d+):(\d+):([\d.]+)/);
  if (!dim) {
    fail(`cannot probe input ${input}\n\nffmpeg stderr:\n${err.slice(-1200)}`);
  }
  return {
    width: Number(dim[1]), height: Number(dim[2]),
    fps: fps ? Number.parseFloat(fps[1]) : 25,
    duration: dur ? (+dur[1] * 3600 + +dur[2] * 60 + +dur[3]) : 0,
  };
}

// ---------------------------------------------------------------------------
// extraction — ffmpeg list-form spawn → rawvideo rgb24 into a temp dir
// ---------------------------------------------------------------------------

async function extract(cfg, input, bins, SW, SH, maxFrames) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chiaroscuro-port-'));
  const rawPath = path.join(tmp, 'frames.rgb24');
  const vf = [
    `fps=${cfg._fps}`,
    cfg.zoom > 1.001 ? `crop=iw/${cfg.zoom}:ih/${cfg.zoom}` : null,
    `scale=${SW}:${SH}:flags=bicubic`,
  ].filter(Boolean).join(',');

  const args = ['-hide_banner', '-loglevel', 'warning'];
  if (cfg.seek > 0) args.push('-ss', String(cfg.seek));
  args.push('-i', input);
  if (cfg.duration > 0) args.push('-t', String(cfg.duration));
  if (maxFrames) args.push('-frames:v', String(maxFrames));
  args.push('-an', '-sn', '-dn', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', 'rgb24', rawPath);

  log(`⟩ ffmpeg: ${path.basename(bins.ffmpeg)} ${args.join(' ')}`);
  const r = await new Promise((resolve) => {
    const p = spawn(bins.ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => resolve({ code: -1, err: String(e) }));
    p.on('close', (code) => resolve({ code, err }));
  });

  const fatal = /moov atom not found|Invalid data found|Error while decoding|could not find codec|Format .* detected only with low score/i;
  if (r.code !== 0 || fatal.test(r.err)) {
    fail(`ffmpeg extraction failed (exit ${r.code}). stderr follows:\n${r.err.slice(-1600)}`);
  }
  if (r.err.trim()) log(`⟩ ffmpeg notes (non-fatal stderr):\n${r.err.trim().split('\n').slice(-6).join('\n')}`);

  let size = 0;
  try { size = fs.statSync(rawPath).size; } catch { /* handled below */ }
  const frameBytes = SW * SH * 3;
  const extracted = Math.floor(size / frameBytes);
  const remainder = size % frameBytes;
  if (remainder > 0) log(`⟩ WARNING: ${remainder} trailing bytes (a partial frame at EOF) — counted ${extracted} whole frames, nothing silently dropped`);
  if (extracted === 0) fail(`ffmpeg produced 0 decodable frames for ${input}. stderr:\n${r.err.slice(-800) || '(silent)'}`);
  return { rawPath, extracted, frameBytes };
}

// ---------------------------------------------------------------------------
// tone shaping — the photo-editor sliders, in a fixed honest order
// ---------------------------------------------------------------------------

function makeShaper(cfg) {
  const bp = cfg.blackPoint, wp = Math.max(cfg.whitePoint, cfg.blackPoint + 1e-4);
  const invGamma = 1 / Math.max(cfg.gamma, 1e-4);
  const con = 1 + cfg.contrast * 2;
  const gainExp = Math.pow(2, (cfg.dotGain - 50) / 50);
  const post = cfg.posterize >= 2 ? cfg.posterize : 0;
  return (v) => {
    let x = cl01((cl01(v) - bp) / (wp - bp));   // levels
    x = Math.pow(x, invGamma);                   // gamma
    x += cfg.brightness;                         // brightness
    x = cl01((x - 0.5) * con + 0.5);             // contrast
    if (post) x = Math.round(x * (post - 1)) / (post - 1); // posterize
    x = Math.pow(cl01(x), gainExp);              // dot gain (50 = neutral)
    if (cfg.invert) x = 1 - x;
    return cl01(x);
  };
}

// ---------------------------------------------------------------------------
// dither — floyd (error diffusion) and bayer4 (ordered), quantizing to `levels`
// ---------------------------------------------------------------------------

const BAYER4 = [
  [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
].map((row) => row.map((v) => v / 16 - 0.5));

function ditherLum(src, w, h, levels, mode) {
  const L = Math.max(2, levels | 0);
  const a = Float32Array.from(src);
  if (mode === 'bayer4') {
    const amp = 1 / L;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = cl01(a[i] + BAYER4[y & 3][x & 3] * amp);
      a[i] = Math.round(v * (L - 1)) / (L - 1);
    }
  } else { // floyd–steinberg
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = cl01(a[i]);
      const nv = Math.round(old * (L - 1)) / (L - 1);
      const e = old - nv;
      a[i] = nv;
      if (x + 1 < w) a[i + 1] += e * 7 / 16;
      if (y + 1 < h) {
        if (x > 0) a[i + w - 1] += e * 3 / 16;
        a[i + w] += e * 5 / 16;
        if (x + 1 < w) a[i + w + 1] += e * 1 / 16;
      }
    }
  }
  return a;
}

// ---------------------------------------------------------------------------
// color
// ---------------------------------------------------------------------------

function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0]; else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x]; else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [cl01(r + m), cl01(g + m), cl01(b + m)];
}

function hex2rgb(hex) {
  return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
}

function makeColorizer(cfg) {
  const duoDark = hex2rgb(cfg.duotoneDark), duoLight = hex2rgb(cfg.duotoneLight);
  const temp = cfg.tempShift / 100; // −1..1
  const satF = cfg.saturation / 100;
  const vibF = cfg.vibrance / 100;
  const mode = cfg.colorMode === 'original' ? 'passthrough' : cfg.colorMode;
  return (r, g, b, lum) => {
    // temperature
    r = cl01(r * (1 + 0.5 * temp)); b = cl01(b * (1 - 0.5 * temp));
    const m = (r + g + b) / 3;
    // saturation
    r = cl01(m + (r - m) * satF); g = cl01(m + (g - m) * satF); b = cl01(m + (b - m) * satF);
    // vibrance — boost scales inversely with current chroma
    const cs = Math.max(r, g, b) - Math.min(r, g, b);
    const boost = 1 + vibF * (1 - cs);
    r = cl01(m + (r - m) * boost); g = cl01(m + (g - m) * boost); b = cl01(m + (b - m) * boost);
    // mode
    switch (mode) {
      case 'phosphor': return hsl2rgb(cfg.phosphorHue, 1, cl01(lum * 0.97));
      case 'duotone': {
        const t = cl01(lum);
        return [cl01(duoDark[0] + (duoLight[0] - duoDark[0]) * t),
                cl01(duoDark[1] + (duoLight[1] - duoDark[1]) * t),
                cl01(duoDark[2] + (duoLight[2] - duoDark[2]) * t)];
      }
      case 'heatmap': return hsl2rgb(240 * (1 - cl01(lum)), 1, 0.3 + 0.4 * cl01(lum));
      case 'ink': return [lum, lum, lum];
      default: return [r, g, b]; // passthrough
    }
  };
}

// ---------------------------------------------------------------------------
// gradients — sobel / emboss / laplacian, on the cell grid
// ---------------------------------------------------------------------------

function gradients(lum, w, h, detector) {
  const n = w * h;
  const gx = new Float32Array(n), gy = new Float32Array(n), mag = new Float32Array(n);
  if (detector === 'none') return { gx, gy, mag };
  const at = (x, y) => lum[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let sx = 0, sy = 0;
    if (detector === 'sobel') {
      // [-1 0 1; -2 0 2; -1 0 1] and transpose
      sx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      sy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    } else if (detector === 'emboss') {
      // [-2 -1 0; -1 0 1; 0 1 2] and transpose — a relief kernel with full angle coverage
      sx = -2 * at(x - 1, y - 1) - at(x, y - 1) - at(x - 1, y) + at(x + 1, y) + at(x, y + 1) + 2 * at(x + 1, y + 1);
      sy = -2 * at(x - 1, y - 1) - at(x - 1, y) - at(x, y - 1) + at(x, y + 1) + at(x + 1, y) + 2 * at(x + 1, y + 1);
    } else { // laplacian: magnitude from the 4-neighbor Laplacian, direction from central differences
      const lap = 4 * lum[i] - at(x - 1, y) - at(x + 1, y) - at(x, y - 1) - at(x, y + 1);
      sx = at(x + 1, y) - at(x - 1, y);
      sy = lap * 0.25 + (at(x, y + 1) - at(x, y - 1)) * 0.5;
      gy[i] = sy; gx[i] = sx; mag[i] = Math.min(1, Math.abs(lap) / 2);
      continue;
    }
    gx[i] = sx; gy[i] = sy;
    mag[i] = Math.min(1, Math.hypot(sx, sy) / 4); // normalize: sobel max on 0..1 lum ≈ 4
  }
  return { gx, gy, mag };
}

// ---------------------------------------------------------------------------
// shapematch — hand-drawn 4×6 templates (curated alphabet; see honest notes)
// ---------------------------------------------------------------------------

const TEMPLATES = (() => {
  const raw = {
    ' ': ['    ', '    ', '    ', '    ', '    ', '    '],
    '.': ['    ', '    ', '    ', '    ', ' ## ', ' ## '],
    ':': ['    ', ' #  ', ' #  ', ' #  ', ' #  ', '    '],
    '-': ['    ', '    ', '    ', '####', '    ', '    '],
    '~': ['    ', '    ', '  ##', ' ## ', '##  ', '    '],
    '=': ['    ', '####', '    ', '    ', '####', '    '],
    '+': [' #  ', ' #  ', '####', '####', ' #  ', ' #  '],
    '|': [' #  ', ' #  ', ' #  ', ' #  ', ' #  ', ' #  '],
    '/': ['   #', '  # ', '  # ', ' #  ', ' #  ', '#   '],
    'x': ['#  #', '#  #', ' ## ', ' ## ', '#  #', '#  #'],
    'i': [' ## ', '    ', ' #  ', ' #  ', ' #  ', '### '],
    'o': [' ## ', '#  #', '#  #', '#  #', '#  #', ' ## '],
    'O': ['####', '#  #', '#  #', '#  #', '#  #', '####'],
    '%': ['#  #', '# # ', ' #  ', '  # ', ' # #', '#  #'],
    '#': ['#  #', '####', '#  #', '#  #', '####', '#  #'],
    '@': [' ## ', '####', '## #', '## #', '####', ' ## '],
  };
  return Object.entries(raw).map(([ch, rows]) => {
    let bits = 0;
    for (let y = 0; y < 6; y++) for (let x = 0; x < 4; x++) if (rows[y][x] === '#') bits |= 1 << (y * 4 + x);
    return { ch, bits };
  });
})();

function shapematchChar(patch, w) { // patch: 4×6 lums for one cell, row-major
  let mean = 0; for (let i = 0; i < 24; i++) mean += patch[i];
  mean /= 24;
  let bits = 0;
  for (let i = 0; i < 24; i++) if (patch[i] > mean + 0.03) bits |= 1 << i;
  let best = TEMPLATES[0], bestD = 25;
  for (const t of TEMPLATES) {
    let x = bits ^ t.bits, d = 0;
    while (x) { d += x & 1; x >>= 1; }
    if (d < bestD) { bestD = d; best = t; }
  }
  return best.ch;
}

// ---------------------------------------------------------------------------
// braille — U+2800 + bitmask over a 2×4 patch; bit(r,c) = 1 << (r + 3*c)
// ---------------------------------------------------------------------------

function brailleFromSub(sub, subW, cx, cy) {
  let bits = 0;
  for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) {
    const v = sub[(cy * 4 + dy) * subW + cx * 2 + dx];
    if (v > 0.5) bits |= 1 << (dy + 3 * dx);
  }
  return String.fromCodePoint(0x2800 + bits);
}

// ---------------------------------------------------------------------------
// frame grid builder — one pass over the raw rgb24 sample
//   sample is SW=cols*4 × SH=rows*8; every engine reads from grids carved
//   out of that one buffer: cells (4×8 avg), braille subdots (2×2 blocks),
//   pixel halves (4×4), shapematch patches (4×6, rows collapsed 8→6).
// ---------------------------------------------------------------------------

function buildGrids(buf, SW, SH, cols, rows) {
  const n = cols * rows;
  const cellL = new Float32Array(n), cellR = new Float32Array(n), cellG = new Float32Array(n), cellB = new Float32Array(n);
  const cellL2 = new Float32Array(n); // sum of squares for patch variance
  const subW = cols * 2, subH = rows * 4;
  const sub = new Float32Array(subW * subH);
  const halfL = new Float32Array(n * 2), halfR = new Float32Array(n * 2), halfG = new Float32Array(n * 2), halfB = new Float32Array(n * 2);
  const pW = cols * 4, pH = rows * 6;
  const patch = new Float32Array(pW * pH);
  const subCnt = new Float32Array(subW * subH), halfCnt = new Float32Array(n * 2), patchCnt = new Float32Array(pW * pH);

  for (let y = 0; y < SH; y++) {
    const cy = Math.floor(y / 8);
    const py = Math.min(pH - 1, Math.floor(y * 6 / 8));
    const hy = y < 4 ? 0 : 1;
    for (let x = 0; x < SW; x++) {
      const i = (y * SW + x) * 3;
      const r = buf[i] / 255, g = buf[i + 1] / 255, b = buf[i + 2] / 255;
      const l = 0.299 * r + 0.587 * g + 0.114 * b; // the 1890s weights — still correct in 2026
      const cx = Math.floor(x / 4), ci = cy * cols + cx;
      cellL[ci] += l; cellR[ci] += r; cellG[ci] += g; cellB[ci] += b; cellL2[ci] += l * l;
      const si = (cy * 4 + Math.floor((y % 8) / 2)) * subW + cx * 2 + Math.floor((x % 4) / 2);
      sub[si] += l; subCnt[si]++;
      const hi = ci * 2 + hy;
      halfL[hi] += l; halfR[hi] += r; halfG[hi] += g; halfB[hi] += b; halfCnt[hi]++;
      const pi = py * pW + x;
      patch[pi] += l; patchCnt[pi]++;
    }
  }
  const div = (a, c) => { for (let i = 0; i < a.length; i++) a[i] /= c[i] || 1; return a; };
  div(sub, subCnt); div(halfL, halfCnt); div(halfR, halfCnt); div(halfG, halfCnt); div(halfB, halfCnt); div(patch, patchCnt);
  for (let i = 0; i < n; i++) { cellL[i] /= 32; cellR[i] /= 32; cellG[i] /= 32; cellB[i] /= 32; }

  const patchVar = new Float32Array(n);
  for (let i = 0; i < n; i++) patchVar[i] = Math.max(0, cellL2[i] / 32 - cellL[i] * cellL[i]);

  return { cellL, cellR, cellG, cellB, patchVar, sub, subW, halfL, halfR, halfG, halfB, patch, pW, pH };
}

// mirror / kaleidoscope operate on the raw sample, before any grid exists
function foldSample(buf, SW, SH, mirror, kaleido) {
  if (!mirror && kaleido < 2) return buf;
  const out = Buffer.allocUnsafe(buf.length);
  const halfW = Math.floor(SW / 2), halfH = Math.floor(SH / 2);
  for (let y = 0; y < SH; y++) {
    const srcY = (kaleido >= 4 && y >= halfH) ? (SH - 1 - y) : y;
    for (let x = 0; x < SW; x++) {
      let srcX = x;
      if (mirror) srcX = SW - 1 - x;
      if (kaleido >= 2 && x >= halfW) srcX = mirror ? x : (SW - 1 - x); // fold, unless already mirrored
      const d = (y * SW + x) * 3, s = (srcY * SW + srcX) * 3;
      out[d] = buf[s]; out[d + 1] = buf[s + 1]; out[d + 2] = buf[s + 2];
    }
  }
  return out;
}

function quantile(arr, q) {
  const s = Float32Array.from(arr).sort();
  const i = Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))));
  return s[i];
}

function blur3(src, w, h, passes) {
  let a = Float32Array.from(src), b = new Float32Array(a.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const l = x > 0 ? a[i - 1] : a[i], r = x < w - 1 ? a[i + 1] : a[i];
      b[i] = (l + a[i] + r) / 3;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const u = y > 0 ? b[i - w] : b[i], d = y < h - 1 ? b[i + w] : b[i];
      a[i] = (u + b[i] + d) / 3;
    }
  }
  return a;
}

// ---------------------------------------------------------------------------
// output emitters
// ---------------------------------------------------------------------------

const c255 = (v) => Math.round(cl01(v) * 255);
const hex2 = (v) => c255(v).toString(16).padStart(2, '0');

function emitTxt(cells) {
  return cells.map((row) => row.map((c) => c.ch).join('')).join('\n');
}

function emitAns(cells) {
  const parts = [];
  for (const row of cells) {
    for (const c of row) {
      if (c.bg) parts.push(`\x1b[38;2;${c255(c.fr)};${c255(c.fg)};${c255(c.fb)};48;2;${c255(c.br)};${c255(c.bg2)};${c255(c.bb)}m${c.ch}`);
      else parts.push(`\x1b[38;2;${c255(c.fr)};${c255(c.fg)};${c255(c.fb)}m${c.ch}`);
    }
    parts.push('\x1b[0m\n');
  }
  return parts.join('');
}

function emitHtmlFrame(cells, n) {
  const parts = [`<pre class="f" data-n="${n}">`];
  for (const row of cells) {
    let run = null, runStyle = '';
    const flush = () => { if (run) { parts.push(`<span style="${runStyle}">${run.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`); run = null; } };
    for (const c of row) {
      const style = c.bg
        ? `color:#${hex2(c.fr)}${hex2(c.fg)}${hex2(c.fb)};background-color:#${hex2(c.br)}${hex2(c.bg2)}${hex2(c.bb)}`
        : `color:#${hex2(c.fr)}${hex2(c.fg)}${hex2(c.fb)}`;
      if (style !== runStyle || (run && run.length > 240)) { flush(); runStyle = style; run = ''; }
      if (!run) run = '';
      run += c.ch;
    }
    flush();
    parts.push('\n');
  }
  parts.push('</pre>');
  return parts.join('');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const { cfg, userSet, positional } = parseArgs(process.argv.slice(2));
  applyParams(cfg, userSet);
  for (const k of Object.keys(DIALS)) if (cfg[k] === undefined) cfg[k] = DIALS[k].def;

  if (positional.length !== 1) fail(`exactly one input file expected (got ${positional.length})\n\n${usage()}`, 2);
  const input = path.resolve(positional[0]);
  if (!fs.existsSync(input)) fail(`input not found: ${input}`);

  // engine-implied defaults (only where the user stayed silent)
  if (!userSet.has('edgeMix')) cfg.edgeMix = cfg.engine === 'sculpt' ? 1 : 0;

  // resolve ramp
  let ramp = RAMPS[cfg.glyphRamp] ?? RAMPS.classic;
  if (cfg.customRamp.length > 0) ramp = cfg.customRamp;
  if (cfg.glyphRamp === 'custom' && !cfg.customRamp) fail(`--glyphRamp custom requires --customRamp`);

  // bins
  const ffmpeg = resolveBin('ffmpeg', 'FFMPEG_BIN');
  if (!ffmpeg) fail('no ffmpeg found (tried $FFMPEG_BIN, PATH, ~/.local/bin, ~/scratch). Install ffmpeg or point FFMPEG_BIN at a static build.');
  const ffprobe = resolveBin('ffprobe', 'FFPROBE_BIN');
  log(`⟩ bins: ffmpeg=${ffmpeg}${ffprobe ? ` ffprobe=${ffprobe}` : ' (ffprobe absent — will parse ffmpeg stderr)'}`);

  // probe
  const info = await probe(input, { ffmpeg, ffprobe });
  const effFps = cfg.fps > 0 ? cfg.fps : info.fps;
  cfg._fps = effFps;
  log(`⟩ source: ${info.width}×${info.height} @ ${info.fps.toFixed(3)}fps, ${info.duration.toFixed(2)}s → sampling at ${effFps.toFixed(3)}fps`);

  // grid geometry — rows derived through the font-metrics cellAspect
  let cols = cfg.cols;
  let rows = cfg.rows > 0 ? cfg.rows : Math.max(4, Math.round(cols * cfg.cellAspect * info.height / info.width));
  if (cols > cfg.maxCols) { log(`⟩ cols clamped ${cols} → ${cfg.maxCols} (maxCols)`); cols = cfg.maxCols; }
  if (rows > cfg.maxRows) { log(`⟩ rows clamped ${rows} → ${cfg.maxRows} (maxRows)`); rows = cfg.maxRows; }
  const SW = cols * 4, SH = rows * 8; // supersample: 4×8 per cell feeds every engine

  // frame range
  let rangeLo = 0, rangeHi = Infinity;
  if (cfg.frameRange) {
    const m = cfg.frameRange.match(/^(\d+)(?:-(\d+)?)?$/);
    if (!m) fail(`--frameRange must look like "5" or "10-40" or "30-" (got "${cfg.frameRange}")`, 2);
    rangeLo = Number(m[1]);
    if (m[2] !== undefined && m[2] !== '') rangeHi = Number(m[2]);
    else if (cfg.frameRange.includes('-')) rangeHi = Infinity; // "30-" = to end
    else rangeHi = rangeLo;                                    // "5" = just frame 5
    if (rangeHi < rangeLo) fail(`--frameRange end (${rangeHi}) before start (${rangeLo})`, 2);
  }

  // extract
  const maxFrames = Number.isFinite(rangeHi) ? rangeHi + 1 : 0;
  const { rawPath, extracted, frameBytes } = await extract(cfg, input, { ffmpeg }, SW, SH, maxFrames);
  log(`⟩ extracted ${extracted} frame(s) @ ${effFps.toFixed(3)}fps → samples ${SW}×${SH} (rgb24)`);

  // honest frame accounting — never silently drop (range caps extraction by design)
  let expectMin = cfg.duration > 0
    ? Math.max(1, Math.ceil(cfg.duration * effFps * 0.85))
    : (info.duration > 0 ? Math.ceil(Math.max(0, info.duration - cfg.seek) * effFps * 0.85) : 0);
  if (maxFrames) expectMin = Math.min(expectMin, maxFrames);
  if (expectMin && extracted < expectMin) {
    fail(`frame loss: extracted ${extracted} but expected ≥ ${expectMin} (${(cfg.duration || Math.max(0, info.duration - cfg.seek)).toFixed(2)}s @ ${effFps.toFixed(2)}fps). ffmpeg stderr was printed above if it had anything to say.`);
  }
  const rangeSize = Number.isFinite(rangeHi) ? Math.max(0, Math.min(rangeHi, extracted - 1) - rangeLo + 1) : Math.max(0, extracted - rangeLo);
  if (rangeSize <= 0) fail(`--frameRange ${cfg.frameRange} selects no frames (extracted ${extracted})`);
  if (rangeLo >= extracted) fail(`--frameRange starts at ${rangeLo} but only ${extracted} frames extracted`);

  // output format & destination
  let format = cfg.format;
  const outArg = cfg.out;
  if (!format) {
    const ext = outArg && outArg !== '-' ? path.extname(outArg).toLowerCase() : '.txt';
    format = ext === '.ans' ? 'ans' : ext === '.html' || ext === '.htm' ? 'html' : ext === '.txt' ? 'txt' : '';
    if (!format) fail(`cannot infer format from "${ext}" — pass --format txt|ans|html`, 2);
  }
  const toStdout = !outArg || outArg === '-';
  const outPath = toStdout ? null : path.resolve(outArg);
  if (!toStdout) fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const outFd = toStdout ? 1 : fs.openSync(outPath, 'w');
  const writeOut = (s) => { if (s) fs.writeSync(outFd, s); };

  // pipeline pieces
  const shape = makeShaper(cfg);
  const colorize = makeColorizer(cfg);
  const rampLen = ramp.length;

  // html header
  if (format === 'html') {
    const fontCss = FONTS[cfg.font] || cfg.font || 'monospace';
    writeOut(`<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>chiaroscuro port — ${path.basename(input)}</title>\n<style>\n` +
      `body{background:${cfg.bgCol};color:#ccc;margin:0;padding:2em;}\n` +
      `h2{font:600 14px/1.4 monospace;color:#888;margin:0 0 1.6em;}\n` +
      `pre.f{margin:0 0 2.4em;padding:0 0 1.6em;border-bottom:1px solid #1c1c22;` +
      `font-family:'${fontCss}',monospace;font-size:${Math.round(13 * cfg.glyphScale)}px;line-height:1.05;` +
      `margin-left:${cfg.glyphOffsetX}ch;padding-top:${cfg.glyphOffsetY}em;white-space:pre;}\n` +
      `footer{color:#666;font:12px/1.6 monospace;}\n</style>\n</head>\n<body>\n` +
      `<h2>chiaroscuro port — ${path.basename(input)} · engine ${cfg.engine} · ${cols}×${rows}</h2>\n`);
  }

  // temporal state — lives across the loop, exactly as the task ordered
  const state = {
    trail: null,          // phosphor persistence lums
    prevL: null, prevRGB: null, // temporal blend
    glitchEvents: 0,
  };

  const lightRad = (cfg.lightAngle * Math.PI) / 180;
  const Lx = Math.cos(lightRad), Ly = Math.sin(lightRad);
  let rendered = 0, firstFrameLines = null;

  const inFd = fs.openSync(rawPath, 'r');
  const buf = Buffer.allocUnsafe(frameBytes);
  for (let f = 0; f < extracted; f++) {
    let need = frameBytes, off = 0;
    while (need > 0) {
      const br = fs.readSync(inFd, buf, off, need, f * frameBytes + off); // readSync returns a plain count
      if (br <= 0) break;
      off += br; need -= br;
    }
    if (need > 0) fail(`short read on frame ${f} (${frameBytes - need} bytes missing) — refusing to render a partial frame silently`);
    if (f < rangeLo || f > rangeHi) continue;

    let sample = foldSample(buf, SW, SH, cfg.mirror, cfg.kaleidoscope);
    const G = buildGrids(sample, SW, SH, cols, rows);
    sample = null;

    // ---- tone shape every luminance surface the engines will read
    const cellL = Float32Array.from(G.cellL, shape);
    const sub = Float32Array.from(G.sub, shape);
    const halfL = Float32Array.from(G.halfL, shape);
    const patch = Float32Array.from(G.patch, shape);

    // ---- temporal: blend with previous, then phosphor trails
    if (cfg.temporalBlend > 0 && state.prevL) {
      const tb = cfg.temporalBlend;
      for (let i = 0; i < cellL.length; i++) {
        cellL[i] = cellL[i] * (1 - tb) + state.prevL[i] * tb;
        G.cellR[i] = G.cellR[i] * (1 - tb) + state.prevRGB[i * 3] * tb;
        G.cellG[i] = G.cellG[i] * (1 - tb) + state.prevRGB[i * 3 + 1] * tb;
        G.cellB[i] = G.cellB[i] * (1 - tb) + state.prevRGB[i * 3 + 2] * tb;
      }
    }
    state.prevL = Float32Array.from(cellL);
    state.prevRGB = new Float32Array(cellL.length * 3);
    for (let i = 0; i < cellL.length; i++) state.prevRGB.set([G.cellR[i], G.cellG[i], G.cellB[i]], i * 3);
    if (cfg.trails > 0) {
      if (!state.trail) state.trail = Float32Array.from(cellL);
      else for (let i = 0; i < cellL.length; i++) state.trail[i] = Math.max(cellL[i], state.trail[i] * cfg.trails);
      for (let i = 0; i < cellL.length; i++) cellL[i] = state.trail[i];
    }

    // ---- atmosphere
    if (cfg.bloom > 0) {
      const mask = Float32Array.from(cellL, (v) => Math.max(0, v - 0.6));
      const soft = blur3(mask, cols, rows, 2);
      for (let i = 0; i < cellL.length; i++) cellL[i] = cl01(cellL[i] + cfg.bloom * soft[i] * 1.6);
    }
    if (cfg.grain > 0 || cfg.scanlines > 0 || cfg.vignette > 0) {
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        let m = 1;
        if (cfg.scanlines > 0 && (y & 1)) m *= 1 - 0.45 * cfg.scanlines;
        if (cfg.vignette > 0) {
          const dx = (x / (cols - 1)) * 2 - 1, dy = (y / (rows - 1)) * 2 - 1;
          m *= 1 - cfg.vignette * Math.min(1, (dx * dx + dy * dy) * 0.75);
        }
        let v = cellL[i] * m;
        if (cfg.grain > 0) v = cl01(v + (Math.random() * 2 - 1) * cfg.grain * 0.22);
        cellL[i] = cl01(v);
      }
    }

    // ---- gradients (sculpt / glyph edge path)
    const grad = (cfg.engine === 'sculpt' || (cfg.engine === 'glyph' && cfg.edgeMix > 0)) && cfg.edgeDetector !== 'none'
      ? gradients(cellL, cols, rows, cfg.edgeDetector) : null;
    if (grad) for (let i = 0; i < grad.mag.length; i++) grad.mag[i] = Math.min(1, grad.mag[i] * cfg.edgeMix);

    // variance → braille thresholds
    let varThresh = Infinity, brailleThresh = Infinity;
    if (cfg.varianceBlend > 0) varThresh = quantile(G.patchVar, 1 - 0.75 * cfg.varianceBlend);
    if (cfg.brailleBlend > 0) brailleThresh = quantile(G.patchVar, 1 - cfg.brailleBlend / 100);

    // ---- dithered copies where ramps quantize
    let toneD = cellL;
    if (cfg.dither !== 'none' && (cfg.engine === 'glyph' || cfg.engine === 'sculpt' || cfg.engine === 'halftone')) {
      toneD = ditherLum(cellL, cols, rows, rampLen, cfg.dither);
    }
    let subD = sub;
    if (cfg.dither !== 'none' && cfg.engine === 'braille') subD = ditherLum(sub, G.subW, rows * 4, 2, cfg.dither);

    const rampChar = (v) => ramp[Math.min(rampLen - 1, Math.max(0, Math.round(cl01(v) * (rampLen - 1))))];

    // ---- the engine: what should the character know?
    const cells = [];
    for (let y = 0; y < rows; y++) {
      const row = [];
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const lum = cellL[i];
        let ch = null, isEdge = false, shade = 1;
        let [fr, fg, fb] = colorize(G.cellR[i], G.cellG[i], G.cellB[i], lum);

        switch (cfg.engine) {
          case 'glyph':
          case 'sculpt': {
            ch = rampChar(toneD[i]);
            if (grad && grad.mag[i] > cfg.edgeThreshold) {
              isEdge = true;
              const sx = grad.gx[i], sy = grad.gy[i];
              const ang = Math.abs(Math.atan2(sy, sx)) * 180 / Math.PI; // 0..180
              const diag = sx * sy > 0;
              let heavy = grad.mag[i] > 0.5;
              if (ang < 22.5 || ang > 157.5) ch = heavy ? '━' : '─';        // gradient horizontal → contour vertical
              else if (ang > 67.5 && ang < 112.5) ch = heavy ? '┃' : '│';   // gradient vertical → contour horizontal
              else ch = diag ? '╱' : '╲';
              // virtual light emboss
              const gm = Math.hypot(sx, sy) || 1e-6;
              const lambert = (sx / gm) * Lx + (sy / gm) * Ly;
              shade = cl01(0.5 + cfg.lightStrength * 0.9 * lambert);
              if (cfg.edgePaint === 'white') { fr = fg = fb = shade; }
              else if (cfg.edgePaint === 'black') { const v = 0.08 + 0.3 * (1 - shade); fr = fg = fb = v; }
              else { fr = cl01(fr * (0.35 + 0.85 * shade)); fg = cl01(fg * (0.35 + 0.85 * shade)); fb = cl01(fb * (0.35 + 0.85 * shade)); }
            } else if (G.patchVar[i] > varThresh || G.patchVar[i] > brailleThresh) {
              ch = brailleFromSub(subD, G.subW, x, y); // the Sculptor's high-variance dissolve
            }
            break;
          }
          case 'pixel': {
            const hi = i * 2;
            if (format === 'txt') {
              // no color channel in txt: ink = brightness
              const t = halfL[hi] > 0.5, b = halfL[hi + 1] > 0.5;
              ch = t && b ? '█' : t ? '▀' : b ? '▄' : ' ';
            } else {
              ch = '▀';
            }
            break;
          }
          case 'braille': {
            ch = brailleFromSub(subD, G.subW, x, y);
            break;
          }
          case 'shapematch': {
            const p = new Float32Array(24);
            for (let ty = 0; ty < 6; ty++) for (let tx = 0; tx < 4; tx++) {
              p[ty * 4 + tx] = patch[(y * 6 + ty) * G.pW + x * 4 + tx];
            }
            ch = shapematchChar(p);
            break;
          }
          case 'halftone': {
            // APPROXIMATION (honest ledger): the Studio draws real ink circles
            // with real radii; text cells carry dot-density glyphs instead.
            ch = HALFTONE_RAMP[Math.min(HALFTONE_RAMP.length - 1, Math.max(0, Math.round(cl01(toneD[i]) * (HALFTONE_RAMP.length - 1))))];
            break;
          }
        }

        const cell = { ch, fr, fg, fb };
        if (cfg.engine === 'pixel' && format !== 'txt') {
          const hi = i * 2;
          const [atr, atg, atb] = colorize(G.halfR[hi], G.halfG[hi], G.halfB[hi], halfL[hi]);
          const [abr, abg, abb] = colorize(G.halfR[hi + 1], G.halfG[hi + 1], G.halfB[hi + 1], halfL[hi + 1]);
          cell.fr = atr; cell.fg = atg; cell.fb = atb;
          cell.bg = true; cell.br = abr; cell.bg2 = abg; cell.bb = abb;
        }
        row.push(cell);
      }
      cells.push(row);
    }

    // ---- glitch: tear the finished character grid
    if (cfg.glitch > 0 && Math.random() < cfg.glitchRate) {
      state.glitchEvents++;
      const bands = 1 + Math.floor(Math.random() * 3);
      for (let b = 0; b < bands; b++) {
        const y0 = Math.floor(Math.random() * rows);
        const y1 = Math.min(rows - 1, y0 + 1 + Math.floor(Math.random() * 4));
        const dx = Math.round((Math.random() * 2 - 1) * cfg.glitchIntensity);
        if (!dx) continue;
        for (let y = y0; y <= y1; y++) {
          const row = cells[y];
          if (dx > 0) { const cut = row.splice(cols - dx, dx); row.unshift(...cut); }
          else { const cut = row.splice(0, -dx); row.push(...cut); }
          for (let x = 0; x < cols; x++) {
            if (Math.random() < cfg.glitch * 0.25) row[x].ch = ramp[Math.floor(Math.random() * rampLen)];
          }
        }
      }
    }

    // ---- emit
    if (format === 'txt') {
      const block = emitTxt(cells);
      writeOut((rendered > 0 ? '\n\n' : '') + block + '\n');
      if (rendered === 0) firstFrameLines = block.split('\n').slice(0, 5);
    } else if (format === 'ans') {
      writeOut((rendered > 0 ? '\n' : '') + emitAns(cells));
    } else {
      writeOut(emitHtmlFrame(cells, rendered) + '\n');
    }
    rendered++;
    if (rendered % 25 === 0) log(`⟩ rendered ${rendered}/${rangeSize}`);
  }
  fs.closeSync(inFd);

  if (format === 'html') {
    writeOut(`<footer>generated by tools/video-port/port-video.mjs · engine ${cfg.engine} · ${cols}×${rows} · ${rendered} frames · manifest sidecar: chiaroscuro-port/v1</footer>\n</body>\n</html>\n`);
  }
  if (!toStdout) fs.closeSync(outFd);

  // ---- the receipt
  const dropped = extracted - rendered;
  log(`⟩ rendered ${rendered} frame(s)${cfg.frameRange ? ` (frameRange "${cfg.frameRange}" of ${extracted} extracted)` : ` — all ${extracted} extracted`}`);
  if (!cfg.frameRange && rendered !== extracted) fail(`frame accounting failed: rendered ${rendered} ≠ extracted ${extracted} with no frameRange — this is a bug, not a feature`);
  let outBytes = 0;
  if (!toStdout) outBytes = fs.statSync(outPath).size;
  log(`⟩ wrote ${toStdout ? '<stdout>' : `${outPath} (${outBytes.toLocaleString()} bytes)`} · format ${format}`);

  // ---- manifest: the parameter manifest IS the record of the port
  if (cfg.manifest) {
    const hash = createHash('sha256');
    const fd = fs.openSync(input, 'r');
    const hb = Buffer.allocUnsafe(1 << 20);
    let pos = 0;
    for (;;) {
      const br = fs.readSync(fd, hb, 0, hb.length, pos);
      if (br <= 0) break;
      hash.update(hb.subarray(0, br)); pos += br;
    }
    fs.closeSync(fd);

    const dials = {};
    for (const k of Object.keys(DIALS)) if (!['params'].includes(k)) dials[k] = cfg[k];
    dials.cols = cols; dials.rows = rows; dials.fps = effFps; dials.format = format;

    const manifest = {
      schema: 'chiaroscuro-port/v1',
      input: { path: input, bytes: fs.statSync(input).size, sha256: hash.digest('hex'), width: info.width, height: info.height, nativeFps: info.fps, durationSec: info.duration },
      frames: { extracted, rendered, glitchEvents: state.glitchEvents, range: cfg.frameRange || null },
      fps: effFps, cols, rows, sample: { width: SW, height: SH },
      engine: cfg.engine,
      dials,
      ramp,
      notes: [
        'halftone approximated in text with dot-density glyphs " ·∙•●" — the Studio draws real ink circles',
        'shapematch templates are hand-drawn 4×6 bitmaps for a curated alphabet (offline, no font rasterizer)',
        'typeface rides as CSS in html output; txt/ans use the terminal’s own font',
        'pixel engine in txt mode falls back to " ▀▄█" (no color channel)',
      ],
      generated_at: new Date().toISOString(),
      tool: 'tools/video-port/port-video.mjs',
    };
    const mPath = toStdout ? 'chiaroscuro-port.manifest.json' : outPath + '.manifest.json';
    fs.writeFileSync(mPath, JSON.stringify(manifest, null, 2) + '\n');
    log(`⟩ manifest: ${mPath} (chiaroscuro-port/v1, ${Object.keys(dials).length} dials)`);
  }

  fs.rmSync(path.dirname(rawPath), { recursive: true, force: true });
}

main().catch((e) => fail(`unexpected: ${e && e.stack ? e.stack : e}`));
