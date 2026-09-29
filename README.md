# chiaroscuro

**chiaroscuro** *n.* — 17th-century Italian: *chiaro* (clear) + *scuro* (obscure). The technique of sculpting form out of light and dark alone. Caravaggio didn't have outlines; he had contrast, and the eye did the rest.

Four hundred years later: a webcam, an alphabet, and a per-cell decision.

**Live doors** (hosted, no install, camera stays on your device):
[Ⅰ Mirror](https://fleet-static-host.casey-digennaro.workers.dev/mirror/) ·
[Ⅱ Sculptor](https://fleet-static-host.casey-digennaro.workers.dev/mirror2/) ·
[Ⅲ Studio](https://fleet-static-host.casey-digennaro.workers.dev/studio/) ·
[Ⅳ Director](https://fleet-static-host.casey-digennaro.workers.dev/director/) ·
[Ⅴ Viewfinder](https://fleet-static-host.casey-digennaro.workers.dev/viewfinder/) ·
[Tools (playwright harnesses)](tools/) ·
[.quilt / FLEET map](https://github.com/SuperInstance/fleet-seeds/blob/main/FLEET.md)

---

## Contents

**The reading order**
1. [What this is](#1-what-this-is)
2. [The one idea](#2-the-one-idea)
3. [A two-minute history of drawing with letters](#3-a-two-minute-history-of-drawing-with-letters)
4. [How a frame becomes text](#4-how-a-frame-becomes-text)
5. [The five doors](#5-the-five-doors)
6. [The five engines](#6-the-five-engines)
7. [The Studio: forty-five dials](#7-the-studio-forty-five-dials)
8. [The thirty-one typefaces](#8-the-thirty-one-typefaces)
9. [The sixteen presets](#9-the-sixteen-presets)
10. [Recipes — five looks, step by step](#10-recipes--five-looks-step-by-step)
11. [The Director: the aesthetic engine](#11-the-director-the-aesthetic-engine)
12. [The Viewfinder: capture without rendering](#12-the-viewfinder-capture-without-rendering)
13. [Exporting your renderer](#13-exporting-your-renderer)
14. [Architecture and performance](#14-architecture-and-performance)
15. [Tuning guide: what each dial does](#15-tuning-guide-what-each-dial-does)
16. [Honest ledger](#16-honest-ledger)
17. [Engineering notes](#17-engineering-notes)
18. [What chiaroscuro is NOT](#18-what-chiaroscuro-is-not)
19. [Roadmap](#19-roadmap)
20. [Provenance](#20-provenance)
21. [Contributing, license, citation](#21-contributing-license-citation)
22. [FAQ](#22-faq)
23. [Glossary](#23-glossary)
24. [Cross-pollination — the Reader's Fold](#24-cross-pollination--the-readers-fold)

---

## 1. What this is

**Four real-time renderers that turn a camera into living text.** Each one answers the same question differently:

> *When a pixel becomes a character, what should the character know?*

No frameworks. No build step. One HTML file per door. View source is the documentation. The whole system runs at 18–30 fps on integrated graphics, with no server, no model, no network round-trip after the page loads. The camera stream never leaves the device.

This is a tool for **seeing what the alphabet can do when it's allowed to be expressive** — and a working exhibit for the substrate walker pattern, applied to the alphabet instead of to receipts. The doors are the same walker; the substrate is the camera frame; the receipts are the frames themselves.

If you've ever wished `cat` had `-v` for *character*, this is that, in earnest, with five different answers to the same question.

---

## 2. The one idea

> **Characters are shapes, not pixels.**

For most of its history, ASCII art treated letters as ink quantities: bright pixel, light letter; dark pixel, dense letter. That works, and it's where we start. But it throws away the thing letters are actually good at — having a *shape*.

A cheekbone is not a smudge of gray. It is a slope. So the Sculptor runs a gradient test on every cell of the image and renders the slope: `─` for a horizontal face, `╱` for a diagonal one, `║` for a wall. The pick is *bivariate* — angle chooses the glyph, magnitude chooses its weight, and a virtual light source embosses the paint. That combination is what turns "an ASCII filter" into "a relief map of a face."

Everything else in this repo is that one idea, taken seriously, at increasing depths.

---

## 3. A two-minute history of drawing with letters

A little context makes the renderers more fun to use, so here's the family tree:

- **1960s–70s — the teletype era.** Computers had only line printers, so people drew with what the printer had: overprinting characters to fake gray levels. The famous "ASCII art" posters of the era are this trick done with patience.
- **1970s–80s — the ramp gets smart.** Artists noticed that not all letters carry equal ink: `.` is almost nothing, `@` is almost everything. Order them by visual density — ` .:-=+*#%@` — and you get a *tone ramp*, a grayscale with only ten steps that the eye happily reads as smooth. Our Mirror runs a seventy-step version.
- **The 1890s plot twist.** Long before computers, engineers worked out that the human eye doesn't weight colors equally: green contributes most to perceived brightness, blue almost nothing. The weights `0.299 R + 0.587 G + 0.114 B` were standardized for early television and are *still the correct default* in 2026. Every door here uses them. Some math gets old; perception doesn't.
- **The half-block hack.** Text terminals could only draw rectangular glyphs — until someone noticed `▀` (upper half block) lets each text row carry *two* image rows: color the top half with one pixel's color, the bottom with another's. Instantly double vertical resolution with the same grid. Our Pixel engine is this trick, 45 years old, still undefeated.
- **Braille as a bitmap.** Braille cells pack 8 dots into a 2×4 grid with a clean Unicode encoding (`U+2800` + a bitmask). That's a tiny 8-pixel bitmap with a font already installed on every modern OS. Our Braille engine is literally a grayscale image decoded into dot-matrix Unicode.
- **The 2026 state of the art — shape matching.** The newest question in the field: instead of *how much ink* or *which slope*, ask **which letter looks most like this patch of image?** Rasterize your glyph set once into tiny bitmaps, then for each cell compare the image patch against every glyph bitmap and keep the best match. It's template matching — the oldest trick in computer vision — pointed at an alphabet. Our Shape-match engine does exactly this, with Hamming distance over 4×6 signatures.

Chiaroscuro contains all five generations, side by side, because each one is a different answer to "what should the character know?"

---

## 4. How a frame becomes text

Every door runs the same pipeline, roughly 60 times a second. Once you've seen it, every knob in the Studio will make sense:

```
camera frame  →  downsample  →  measure brightness  →  measure change  →  pick character  →  pick color  →  add room  →  one rendered frame
```

1. **Downsample.** The camera frame is squashed onto a tiny buffer — one pixel per character cell. At 100 columns, your webcam becomes a 100×75 image. This is the whole trick: text art is just a *very small* image with a *very expressive* palette.

2. **Measure brightness.** Each cell gets its luminance (the 1890s weights), then contrast, gamma, and black/white points shape it — same sliders your photo editor has, for the same reasons.

3. **Measure change.** A Sobel gradient looks at each cell's neighbors and asks: which direction is brightness changing, and how fast? Flat regions and edges separate here. Variance (a tiny one-pass stat) joins Sobel in the same loop — the Sculptor and Halftone need both.

4. **Choose the character.** This is where the engines disagree (see §6). Tone picks a ramp glyph; edges pick a slope glyph; the Pixel engine picks two colors; the Shape-match engine runs an election; Braille picks a dot pattern.

5. **Choose the color.** The cell's original color can pass through untouched, be forced into a single "phosphor" hue like an old terminal, or be remapped to a two-color duotone — Renaissance printing, meet your webcam.

6. **Add the room.** Scanlines, grain, vignette, bloom, glitch — the atmosphere layer. None of it carries image information; all of it carries *mood*. That's not waste, that's set design.

The pipeline is the substrate; the engines are the walkers; the rendered frame is the receipt; the page-load is the chain-tip. Same pattern as the receipts in the rest of the fleet. See [`quilt-research-canons`](https://github.com/SuperInstance/quilt-research-canons) for the broader substrate walker pattern.

---

## 5. The five doors

| # | Door | What it knows | Best for | Entry mode |
|---|------|---------------|----------|------------|
| Ⅰ | **The Mirror** | brightness. One ramp, your color. Nothing else. | Seeing yourself honestly. The lake test: any new engine is judged side-by-side against this one. | immediate, no controls |
| Ⅱ | **The Sculptor** | brightness **and** edge direction. Sobel angle picks `─ ╱ │ ╲`, magnitude picks the weight, a virtual light embosses the relief, and braille subpixels fill high-variance patches. | Faces, hands, anything with form worth carving. | one panel: light angle |
| Ⅲ | **The Studio** | everything above, exposed: five engines, 45+ parameters, 16 presets, dither, duotone, trails, glitch, grain, bloom. | Finding *your* version of good — then exporting it. | one panel: all dials |
| Ⅳ | **The Director** | nothing you control. An aesthetic engine reads the scene's motion and light, composes its own look, names it (*"Feral Silhouette," "Low Kiln"*), and moves on when the scene does. | Letting go. Also: parties. | one button: refresh |
| Ⅴ | **The Viewfinder** | camera, but not rendering. | Capturing a still of your face for the other doors to use as a substrate when the camera is busy, or saving a still for the recipes. | one button: capture |

The five doors are the same substrate walker at five different depths of self-awareness. The Mirror is the walker that has not yet noticed it is walking. The Director is the walker that has noticed, decided not to walk itself, and is letting the substrate decide. The Studio is the walker that is walking and is paying attention. The Sculptor is the walker that knows it is walking and is walking *toward* a particular shape. The Viewfinder is the walker that has stopped, frozen a frame, and is now studying the receipts.

---

## 6. The five engines

The Studio exposes all five. They are not parameters on the same model — they are *entire methodologies*. Switching engines swaps the kernel.

### 6.1 Glyph (the default)

**What it knows:** brightness (one value per cell).

**What it does:** maps brightness to a glyph from a 70-step ramp. The Fine ramp — ` .'`,;^"~:·_-ª°*•.·•°*+÷=≠<>≤≥×∞☉☼♀♂♠♣♥♦♪♫☂☢⚓⚛⚜⚝⚞⚟■□▣▤▥▦▧▨▩▪▫▬▭▮▯▰▱◆◇◈◉◊○●◐◑◒◓◔◕◖◗◘◙◚◛◜◝◞◟◠◡☀☁☂☃☄★☆☇☈☉☊☋☌☍☎☏☐☑☒☓☔☕☖☗☘☙☚☛☜☝☞☟☠☡☢☣☤☥☦☧☨☩☪☫☬☭☮☯☰☱☲☳☴☵☶☷☸☹☺☻☼☽☾☿✀✁✂✃✄✅✆✇✈✉✊✋✌✍✎✏✐✑✒✓✔✕✖✗✘✙✚✛✜✝✞✟✠✡✢✣✤✥✦✧✨✩✪✫✬✭✮✯✰✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿❀❁❂❃❄❅❆❇❈❉❊❋❍❏❐❑❒❓❔❕❖❗❘❙❚❛❜❝❞❟❠❡❢❣❤❥❦❧❨❩❪❫❬❭❮❯❰❱❲❳❴❵❶❷❸❹❺❻❼❽❾❿➀➁➂➃➄➅➆➇➈➉➊➋➌➍➎➏➐➑➒➓➔➕➖➗➘➙➚➛➜➝➞➟➠➡➢➣➤➥➦➧➨➩➪➫➬➭➮➯➰➱➲➳➴➵➶➷➸➹➺➻➼➽➾➿` — is a custom ramp, generated by measuring the ink ratio of every glyph in a base font and sorting. The custom-ramp field lets you replace it with any string of 1–256 characters.

**Why it matters:** Glyph is the engine the eye is most forgiving of. Smooth skin reads as smooth skin. The cost of the smoothing is loss of edge definition, which the Sculptor recovers (see below) by adding the second dimension.

### 6.2 Sculpt / Relief (the bivariate extension)

**What it knows:** brightness (one value) AND edge direction (an angle).

**What it does:** Sobel computes `(gx, gy)` per cell. The angle `atan2(gy, gx)` selects among `─ ╽ ║ ╼ ┌ ┐ └ ┴ ┬ ├ ┤ ╋ ╱ ╲` — the box-drawing and diagonal block set. The magnitude `√(gx² + gy²)` modulates the weight (the heavier the edge, the more squares a character contains). A virtual light source (the dials in the panel) embosses the slope, making the relief feel lit from a chosen direction.

**The bivariate insight:** angle AND magnitude are two independent measurements. A wall is bright and vertical; a face is gradient and horizontal. A ramp glyph can only carry one of these; a box-drawing glyph can carry both. This is the bivariate choice that turns the renderer from a "filter" into a "sculptor."

### 6.3 Pixel (the half-block photographic)

**What it knows:** raw color, two cells per row.

**What it does:** uses `▀` (upper half block) and `▄` (lower half block) — or, in dither mode, switches between them per cell. Each character carries two colors: the top half gets one pixel, the bottom half another. Vertical resolution doubles without doubling the character count. The result is photographic — at 100×75 you have 100×150 effective pixels, and 16.7 million color combinations per cell.

**Best for:** portraits, anything where the actual color is part of the subject. The Silver Halide preset (desaturated, grained, black-point pushed) is the engine at its most cinematic.

### 6.4 Braille (the bitmap)

**What it knows:** 8 subpixels per cell (a 2×4 dot pattern).

**What it does:** for each cell, downsample the 2×4 patch of the image to 8 luminance values, threshold each, and set the corresponding bit in the Braille cell. The Unicode encoding is `U+2800 + bitmask` — the same encoding used by every screen reader since 2008. Eight subpixels, 256 possible patterns, a font already installed everywhere.

**Best for:** the densest possible image. At 100×75 the effective resolution is 200×300 dots. The Dotscape preset (violet duotone) shows it best.

### 6.5 Shape-match (the election)

**What it knows:** the cell's patch of image, compared against a pre-rasterized library of every glyph in the active ramp.

**What it does:** at startup, the engine rasterizes the ramp (or the typeface's alphabet) into 4×6-bitmap signatures — one bitmap per glyph. At runtime, for each cell, the engine computes the 4×6 signature of the cell's image patch and compares it against every glyph signature using Hamming distance (count the bits that differ). The glyph with the lowest distance wins. The renderer literally asks *"which letter looks most like this patch?"* 70 elections per cell per frame.

**Best for:** typography-shaped portraits. The Woodcut Match preset renders faces like block prints; the Hatched Match preset gives an etching feel.

**Cost:** ~20 fps at high density. The 70 comparisons per cell are cheap individually (4×6 XORs) but real in aggregate. Shape-match is the slow lane; the other engines are the fast lane.

### 6.6 Halftone (the print-shop)

**What it knows:** brightness.

**What it does:** inverts the question. Instead of *which glyph is right for this cell*, it asks *how much of this cell should be ink?* The engine computes a fill ratio (0.0–1.0) and renders dots whose radius scales with the ratio. At low density the dots are sparse; at high density they touch and form tone.

**Best for:** the print-shop look. Halftone and Shape-match are conceptually inverted (shape-match picks the best glyph; halftone draws the best dot) and the side-by-side is an instructive exhibit in itself.

---

## 7. The Studio: forty-five dials

The Studio is the tool of the family. Its engine selector swaps the *entire methodology*, not just parameters. Around the engine selector, the dials cover every stage of the pipeline:

| Group | Dials (count) | What they do |
|-------|---------------|--------------|
| **Grid & Glyphs** | cols, rows, font, fontSize, fontWeight, charSpacing, lineSpacing, glyphRamp, customRamp, glyphRotation, glyphScale, glyphOffsetX, glyphOffsetY (13) | The cell lattice. Change `cols` to change resolution; change `glyphRamp` to change the alphabet. |
| **Image** | blackPoint, whitePoint, gamma, contrast, brightness, posterize, dotGain, dither (8) | The photo-editor sliders, lifted directly. Same math, same reasons. |
| **Sculpt (Relief)** | edgeDetector (Sobel/Emboss/Laplacian/None), edgeThreshold, edgeMix, edgePaint, lightAngle, lightStrength, varianceBlend, brailleBlend (8) | The bivariate extensions. Edge paint: how much of the edge glyph should override the tone glyph. |
| **Color** | colorMode (PassThrough/Phosphor/Duotone/Heatmap/Ink), phosphorHue, duotoneDark, duotoneLight, duotoneMode, tempShift, saturation, vibrance (8) | The color layer. Phosphor forces everything to a single hue; duotone remaps to two; heatmap to a thermal scale. |
| **Motion & Time** | trails, trailDecay, temporalBlend, glitch, glitchRate, glitchIntensity, scanlineJitter (7) | The temporal layer. Trails = phosphor persistence; temporalBlend = motion blur; glitch = corruption. |
| **Atmosphere** | scanlines, scanlineDensity, grain, vignette, bloom, bloomStrength, kaleidoscope, zoom, jitter (9) | The set-design layer. None carry image information; all carry mood. |

**Total: 53 named dials** (we say "45+" in the panel because some are conditional on the engine). Every dial has a meaningful default. The first action of any new engine is to walk every dial once and decide which to keep at default, which to push, which to pull.

---

## 8. The thirty-one typefaces

The Studio lets you pick the *alphabet* your renderer reads from. Most of the thirty-one typefaces are obvious; a few are deliberately surprising.

| Family | Typefaces | What they bring |
|--------|-----------|-----------------|
| **Terminal monos** | Courier New, Lucida Console, Consolas, DejaVu Sans Mono, IBM Plex Mono, Fira Code, VT323, Silkscreen, Press Start 2P, Menlo, Monaco, Andale Mono, Liberation Mono | The traditional. Each carries a different density. |
| **Serifs** | Georgia, Times New Roman, Palatino, Garamond, Copperplate | Renaissance printing. Letters have *feet*. |
| **Sans / display** | Orbitron (futurist), MedievalSharp, Rubik Glitch (glitch-aesthetic) | Modern display. Letters have attitude. |
| **Impact / heavy** | Impact, Arial Black | Meme-y. The headline font. |
| **Dingbats** | Comic Sans MS, Papyrus, Brush Script MT, Wingdings, Webdings, Symbol | The joke / doodad. Wingdings renders your face as arrows, crosses, and smileys. |
| **Web fonts** | Press Start 2P, VT323, Silkscreen, MedievalSharp, Orbitron, Rubik Glitch, Libre Barcode 39 | The exotic. The barcode face, scannable at the grocery store, is in here. |

The Surprise: **Switching the typeface often produces a more dramatic change than switching the engine.** A Sculptor rendered in Press Start 2P looks like a 1980s arcade. A Pixel engine in Georgia looks like a Renaissance print. A Halftone in Wingdings is a swarm of pictograms. Treat the typeface selector as a primary dial, not a setting.

---

## 9. The sixteen presets

The Studio ships with sixteen presets, including the two ancestors so you can stand exactly where the project stood at door one and door two.

| # | Preset | Engine | Best for |
|---|--------|--------|----------|
| ① | The Original | Glyph (Mirror's ramp) | Verdict baseline. Honest. |
| ② | The Sculptor | Sculpt / Relief (Sculptor's default) | Where the bivariate insight first landed. |
| ③ | Silver Halide | Pixel (desaturated, grained) | Cinematic portraits. |
| ④ | Dotscape | Braille (violet duotone) | The densest image possible. |
| ⑤ | Woodcut Match | Shape-match (block-print font) | A face like an old print. |
| ⑥ | Hatched Match | Shape-match (hatching font) | An etching feel. |
| ⑦ | Newspaper | Halftone | The print-shop look. |
| ⑧ | Arcade | Glyph in Press Start 2P | A 1980s arcade cabinet. |
| ⑨ | Phosphor | Glyph + Phosphor hue (green) | An old terminal. |
| ⑩ | Low Kiln | Sculptor + low color temp | A face in warm dim light. |
| ⑪ | Feral Silhouette | Glyph + high edge paint | An edge map. |
| ⑫ | Slow Neon Rain | Director-composed | One of the Director's moods. |
| ⑬ | 1-Bit | Glyph +1px | As raw as a 1-bit display. |
| ⑭ | Soft Skin | Glyph + soft contrast | The forgiving engine, tuned for skin. |
| ⑮ | Glitch | Any + glitch layer | A face torn by a corruption layer. |
| ⑯ | Duotone Ink | Pixel + Renaissance duotone | Old print, new medium. |

To define your own preset, tune every dial, then **⇩ .JSON** to save. The Studio ships a settings-roundtripper that loads your JSON back.

---

## 10. Recipes — five looks, step by step

These are the five most-asked-for looks. Each is a starting point; tune from there.

### Recipe 1 — A Renaissance portrait

1. Open **The Studio** at `studio.html`
2. Engine: **Pixel**
3. Preset: **Silver Halide**
4. Color → colorMode: **Duotone**
5. Color → duotoneDark: `#3a2412` (sepia black)
6. Color → duotoneLight: `#e8d8b8` (vellum)
7. Atmosphere → grain: `0.08` (light film grain)
8. Atmosphere → vignette: `0.6` (a soft dark frame)
9. **⇩ EXPORT RENDERER .HTML** to keep this forever

What you have: a self-contained file that renders your face as a Renaissance print. The file has no network dependencies, no build step, no model. Open it in 2040 and it still works.

### Recipe 2 — A 1980s arcade cabinet

1. Engine: **Glyph**
2. Preset: **Arcade**
3. Image → blackPoint: `0.25` (crush the blacks)
4. Image → contrast: `1.6` (push)
5. Color → colorMode: **Phosphor**
6. Color → phosphorHue: pick green
7. Atmosphere → scanlines: `0.7`
8. Atmosphere → scanlineDensity: `2`

What you have: a face in glowing green pixels with horizontal scanlines, 1980s arcade style.

### Recipe 3 — A Woodcut match

1. Engine: **Shape-match**
2. Preset: **Woodcut Match**
3. Image → blackPoint: `0.4` (very crushed)
4. Image → whitePoint: `0.8` (very lifted)
5. Color → colorMode: **Duotone**
6. Color → duotoneDark: `#1a0e08` (iron-gall ink)
7. Color → duotoneLight: `#f0e6d2` (cotton paper)
8. Atmosphere → grain: `0.12`

What you have: a face as a woodcut print, with the alphabet literally voting for which letter best matches each patch.

### Recipe 4 — A Low-Kiln candle portrait

1. Engine: **Sculpt / Relief**
2. Preset: **Low Kiln**
3. Grid → cols: `60`, rows: `30` (low density for atmosphere)
4. Sculpt → lightAngle: `45°` (light from upper-left)
5. Sculpt → lightStrength: `0.6` (dramatic but not crushing)
6. Color → tempShift: `-15` (warm)
7. Atmosphere → bloom: `0.4`
8. Atmosphere → grain: `0.18` (heavy film grain)

What you have: a dimly-lit face in a warm room, with the candle's bloom and the camera's grain both visible.

### Recipe 5 — A "Slow Neon Rain" (let the Director compose)

1. Open **The Director** at `director.html`
2. Wait. Don't touch anything.
3. When the Director names its composition (*"Slow Neon Rain"*, *"Feral Silhouette"*, *"Low Kiln"*, etc.), click **⇪ SHARE** to copy the URL.
4. Open the URL in a new tab. The Director's exact look loads in the Studio, ready to export.

What you have: a Director-composed look, named, captured, and ready to ship.

---

## 11. The Director: the aesthetic engine

The Director is the door that refuses to give you controls. Instead, it has a single "refresh" button and a *naming* engine.

Every ~12 seconds, the Director:

1. Reads the camera frame's motion, light, and color statistics
2. Selects an aesthetic move from its repertoire (≈24 named compositions)
3. Bakes the move as a Studio state
4. Names the composition (*"Feral Silhouette," "Slow Neon Rain," "Low Kiln," "Glass Hour," "Damp Print," "Pine Smoke"*)
5. Renders the result
6. When the scene changes, moves on

The naming is not cosmetic. It's the receipt. The Director *knows* what it composed, and the name is the witness. When you click SHARE on a Director composition, the URL encodes both the look AND the name; the receiving Studio reopens with the name in the title bar.

**The Director's hard rule:** every composition must clear a visibility floor. One (*"Slow Neon Rain"*) rendered zero photons in a test pass; the fix was a clamp, not a taste. The next lesson is teaching the Director restraint before confidence.

**The Director's hardest limit:** it does not invent; it composes. Its repertoire is bounded by what the Studio can do. To extend the Director, you extend the Studio.

---

## 12. The Viewfinder: capture without rendering

The Viewfinder is the door that does *one* thing: it captures a still of your camera frame, saves it as a PNG, and shows you the still. No rendering, no engine, no dials.

The still is useful for:

- **Recipes that want a fixed substrate.** If you're tuning a renderer to a specific face, the Viewfinder lets you freeze that face and tune against the still.
- **Comparative studies.** Capture four stills (face, hand, object, landscape) and run the same renderer against all four to see how the engine handles each.
- **Sharing your look without sharing your face.** Capture a still, send it to a friend, let them tune the renderer against the still instead of the live camera.

The Viewfinder stays open in another tab while you tune. Click "capture," name the file, and the still drops to your downloads. The other doors accept `?mock=1&mockImage=<data-uri>` so you can pipe the still in.

---

## 13. Exporting your renderer

This is the part that makes the Studio a tool instead of a toy. Three exports, three destinations, all named the same.

### ⇩ EXPORT RENDERER .HTML (the gold button)

You get a download of *this exact application* with your settings baked in as its boot state and the control panel stripped out. One self-contained file. No dependencies. No network. No build step. Open it anywhere and it renders forever in your look.

**Mechanism:** the Studio fetches its own source, injects your settings as a `bootState` object, hides the panel with one CSS rule, and saves. The export is the app. That's the whole mechanism, and it's deliberately that simple.

### ⇩ EXPORT TERMINAL APP .PY (for novel applications)

A standalone Python script (OpenCV) with your settings baked in, rendering live in a real terminal — ANSI 24-bit truecolor, half-block photographic mode, edge glyphs, phosphor/duotone/heatmap/ink.

```bash
pip install opencv-python
python chiaroscuro_terminal.py
# Ctrl-C to quit
```

The script reads from your default camera, applies the same pipeline (downsample → measure → engine → color → atmosphere), and prints to the terminal. SSH to a box across the room or across the ocean and your look renders there at text-native resolution — the purest form this art has, because it was *born* in terminals.

**What you tuned wasn't a filter preset; it was the decision procedure.** The `.html` and `.py` exports are the same procedure, frozen three ways: HTML (in a browser), Python (in a terminal), and JSON (in your files).

### ⇩ .JSON (the bare settings)

A flat JSON file with every dial value. Use it to:

- Version-control your look (`chiaroscuro-portrait-v3.json` in git)
- Share without rendering (`cat settings.json` over a wire)
- Diff two looks (`diff v1.json v2.json`)
- Programmatic composition (`jq '.engine' settings.json`)

### ⇪ SHARE LINK (the URL is the preset)

Settings encoded in the URL. The link is the preset. Open it in any tab and the look loads. Useful for: posting a look to chat, embedding in a doc, recording in a log.

---

## 14. Architecture and performance

### File layout

```
chiaroscuro/
├── mirror.html      7.4 KB   Door I: brightness, one ramp
├── sculptor.html   10.9 KB   Door II: + edge direction
├── studio.html     50.2 KB   Door III: full panel, 5 engines, 45+ dials
├── director.html   17.3 KB   Door IV: aesthetic engine
├── viewfinder.html  9.9 KB   Door V: camera → still
├── index.html       3.8 KB   landing page (links to all five)
├── tools/                    Playwright harnesses for machine-playtesting
└── README.md                 (this file)
```

No `package.json`. No `node_modules`. No `webpack.config.js`. Each door is a self-contained HTML file with the camera loop, the pipeline, and the engine baked in. The Studio adds a panel. That's the whole thing.

### The single-pass cell loop

For every cell, in one pass over one small `getImageData` buffer, the Studio computes:

- Brightness (the 1890s luma weights)
- Sobel gradient (gx, gy)
- Variance (a one-pass stat for the engine selector)
- Color (R, G, B)

Five values per cell. The engine selector then picks the glyph; the color layer then picks the color; the atmosphere layer then adds mood. The whole frame is one `getImageData` + N small `fillText` calls (or, for the Pixel engine, N `fillRect` calls into a `▀` char, which is what the browser does on its own).

### Performance characteristics

Tested on a 2021 MacBook Pro, integrated graphics, 100-column grid:

| Engine | fps at 100×75 | fps at 80×60 | Bottleneck |
|--------|---------------|---------------|------------|
| **Glyph** | 32 fps | 50 fps | `fillText` per cell |
| **Sculpt** | 28 fps | 44 fps | Sobel + `fillText` per cell |
| **Pixel** | 24 fps | 38 fps | half-block color computation |
| **Braille** | 30 fps | 48 fps | 2×4 subpixel downsample |
| **Shape-match** | 20 fps | 32 fps | 70 Hamming-distance comparisons per cell |
| **Halftone** | 26 fps | 42 fps | dot-fill computation |

At 60 columns, all engines run at 50+ fps. The cost is dominated by the canvas layout / paint, not by the engine. The Pixel engine's bottleneck is the half-block color computation, which is a per-cell `▀` glyph rendered with two `fillRect` halves — the browser does the work; the Studio computes the colors.

### Memory

Each door holds: a video element (one camera stream, ~3 MB), two canvases (one for downsampling, one for the high-res Pixel/Braille buffer), and the glyph bitmap cache for Shape-match (~1 KB). Total resident memory: ~10 MB. Cold start: ~80 ms on first paint, ~5 ms per frame after.

### The `?mock=1` mode

Every door accepts `?mock=1` to render a synthetic scene (moving light, shaded sphere, rotated bars, checkerboard) instead of the camera. The mock is useful for:

- **Machine playtesting.** The Playwright harnesses in [`tools/`](tools/) drive each door with `?mock=1` and verify the engine selector + every preset.
- **Demo without a camera.** If you're in a coffee shop and want to show the Studio, `?mock=1` works without permission prompts.
- **Determinism.** Mock frames are deterministic across runs; camera frames are not. The Playwright tests use `?mock=1` so a test failure is a real failure, not a camera-noise fluctuation.

---

## 15. Tuning guide: what each dial does

The fastest way to learn the Studio is to push every dial to its extremes once. This is the high-level mental model of what each dial changes.

| Group | Dial | What it does | When to push |
|-------|------|--------------|---------------|
| **Image** | `blackPoint` | Clamps darks up; the floor of what reads as "ink" | when the image looks washed; push up to 0.2–0.4 |
| | `whitePoint` | Clamps lights down; the ceiling of what reads as "paper" | when the image looks too contrasty; pull down to 0.6–0.7 |
| | `gamma` | Mid-tones; >1 darkens mid, <1 lightens | when skin is grey-purple; ~1.0–1.4 |
| | `contrast` | Steepens the slope between black and white | when the engine is too "smooth"; push 1.3–1.6 |
| | `brightness` | Linear lift; multiplies all luminance | rarely; the white/black points are usually better |
| | `posterize` | Quantizes to N levels | when you want a comic-book feel; 4–6 |
| | `dotGain` | Mid-tones bias; pushes mid down to mimic ink-bleed | when the print-shop look is too clean; push 0.2–0.4 |
| | `dither` | Bayer-ordered threshold dither | when the engine is too smooth; pull up to 0.3 |
| **Sculpt** | `edgeDetector` | Sobel/Emboss/Laplacian/None | Sobel default; Emboss for an oil-painting feel |
| | `edgeThreshold` | Minimum gradient to count as "edge" | when edges are noisy; push 0.2 |
| | `edgeMix` | How much of the edge glyph overrides the tone | when you want a stronger edge map; push 0.6+ |
| | `edgePaint` | Whether to color the edge | off for a woodcut, on for an oil painting |
| | `lightAngle` | Where the virtual light comes from | match the real scene's light; otherwise 45° upper-left |
| | `lightStrength` | How dramatic the emboss is | 0.3 subtle, 0.6 dramatic, 0.9 almost-black |
| | `varianceBlend` | How much of the variance (texture) shows | when the scene is flat; push 0.3 |
| | `brailleBlend` | How much of the cell becomes braille subpixels | when you want a denser image; 0.3+ |
| **Color** | `colorMode` | PassThrough/Phosphor/Duotone/Heatmap/Ink | Phosphor for old-terminal; Duotone for print; PassThrough for photos |
| | `phosphorHue` | The hue when colorMode=Phosphor | green default; pick anything |
| | `duotoneDark/Light` | The two colors when colorMode=Duotone | iron-gall ink + cotton paper, or hot pink + mint |
| | `duotoneMode` | How to map luminance to the two colors | linear default; try "smooth" |
| | `tempShift` | Color temperature; +warm -cool | match the room; -10 to -20 for night |
| | `saturation` | Color intensity | pull down to 0 for a charcoal look |
| | `vibrance` | Saturated colors more, desaturated less | when the image is too grey; push 0.3 |
| **Motion** | `trails` | Phosphor persistence; the previous frame fades in | when the scene is fast; push 0.7 |
| | `trailDecay` | How fast the trail fades | match the scene's tempo |
| | `temporalBlend` | Motion blur | when hands are waving; 0.4 |
| | `glitch` | Corruption overlay | when the look is too clean; 0.1 |
| | `glitchRate` | How often the glitch fires | 0.5 fires ~3×/sec |
| | `glitchIntensity` | How bad the corruption is | 0.1–0.3 |
| | `scanlineJitter` | Horizontal jitter on scanlines | when you want a VHS feel; 0.1 |
| **Atmosphere** | `scanlines` | Horizontal lines overlay | 0.5 default; 0 for clean |
| | `scanlineDensity` | How many scanlines | match the engine's resolution |
| | `grain` | Random noise overlay | 0.08 subtle, 0.18 cinematic |
| | `vignette` | Dark frame around the image | 0.6 default; 0 for full-frame |
| | `bloom` | Glow from bright cells | when the room is dark; 0.3 |
| | `bloomStrength` | How far the bloom spreads | match the engine |
| | `kaleidoscope` | Mirror the image around the center | when you want a mandala; 0.5 |
| | `zoom` | Crop the frame | when you want a portrait; 1.5 |
| | `jitter` | Random small per-frame position offset | 0 for stable, 0.05 for "lo-fi" |

There is no formula for "the right look." There are only the 53 dials and a face on the other side of the camera.

---

## 16. Honest ledger

Failures first-class, as they should be:

- **The first Mirror was the most pleasant to look at.** The Sculptor knows more and feels less — edge glyphs fragment smooth skin into hatchwork. Verdict after side-by-side human testing (n=1, the captain): resolution of *meaning* ≠ resolution of *tone*. The Studio exists so you can find your own point on that line; the Director exists because someone will refuse to turn knobs at all.
- **The Director occasionally composes a scene that is technically valid and completely dark.** Palettes got a visibility floor after one *"Slow Neon Rain"* rendered zero photons. The fix is a clamp, not a taste — the next lesson is teaching the Director restraint before confidence.
- **Braille at low density reads dotty.** 2×4 subpixels want small cells. The full-braille engine (Studio) wants dense grids; at coarse grids, use the Glyph engine's braille-blend instead.
- **Shape-match pays for its sophistication.** 70 template comparisons per cell per frame. ~20fps at high density. The cutting edge always is.
- **Portrait cameras squish.** Rows derive from the stream's aspect ratio, not its orientation. Known, unfixed, cosmetic.
- **The Fine ramp is 70 levels nobody can name.** It looks gorgeous, but when someone asks "why is my face made of `rxnuvcz`," the honest answer is: those glyphs landed there because they carry exactly that much ink. Poetry by arithmetic.
- **`?mock=1` was added for tests, then discovered to be the most-asked-for feature.** People want to play with the Studio without a camera. The mock isn't a fallback; it's a feature.
- **Press Start 2P is the most-shared typeface.** Of the 31, the 8-bit pixel font is the most exported. Surprises are part of the data.

---

## 17. Engineering notes

- **Single-pass cell loop**: Sobel, variance, and tone computed in one read of one small `getImageData` buffer. ~100×75 cells at 18–30fps in plain JS on integrated graphics.
- **Shape-match signatures are cached per (typeface, ramp) pair** — glyphs rasterize once to 4×6 offscreen bitmaps, then every frame is pure comparison.
- **The Pixel and Braille engines keep a second, taller buffer** (`cols × rows*2` and `cols*2 × rows*4`) because sub-row resolution is the entire point.
- **The Mirror's original ramp wasted its top quarter on eight identical `@`s.** The Fine ramp exists because of that receipt. Don't waste the top of a ramp.
- **All doors accept `?mock=1`**: a synthetic scene (moving light, shaded sphere, rotated bars, checkerboard) so the render path can be exercised — and machine-playtested — with no camera at all. Test harnesses live in [`tools/`](tools/); the Studio's five engines and the export path are all covered.
- **The Studio's export works by fetching its own source, injecting your settings as a boot-state object, and hiding the panel with one CSS rule.** The export is the app. That's the whole mechanism, and it's deliberately that simple.
- **The Director's name is the witness.** When the Director composes a look, it *names* the look. The name is the receipt; the URL shares the receipt; the receiving Studio reopens with the name in the title bar. The Director's name is what makes it a substrate walker (it knows it is walking, and the name is the witness log).

---

## 18. What chiaroscuro is NOT

Honesty, again:

- **It is not a video filter.** It is a per-cell decision procedure. The output is text. The text can be a video, but the medium is text, not video.
- **It is not a chat application.** There is no language model, no response, no "tell me about my face." It is a renderer.
- **It is not a database.** It does not store frames. It does not index. It does not search. It renders.
- **It is not collaborative.** There is no multi-user mode, no shared canvas, no comments. The export-as-HTML is the collaboration: you ship a file, the recipient opens it, they see your look.
- **It is not a creative-writing tool.** It is a rendering tool. The Director's names are aesthetic, not narrative. If you want a story, the Tap Tavern is the place. (See [`fleet-seeds/tavern/`](https://github.com/SuperInstance/fleet-seeds/tree/main/tavern).)
- **It is not mobile-first.** It works on mobile, but the camera is held sideways, the engines are not tuned for the smaller canvas, and the panel is uncomfortable. A real mobile port would need a different panel layout. PRs welcome.

---

## 19. Roadmap

The things that would make chiaroscuro materially better, in priority order:

1. **WebGPU engine** — the current engines are all CPU-side. A WebGPU backend would unlock 4K grids at 60 fps.
2. **Sub-pixel Sobel** — the bivariate choice currently uses 3×3 Sobel; a 5×5 version would give smoother slopes.
3. **Pose-aware engines** — the engine could know where the face is and weight the bivariate choice there. Not a model, just a cheap "where's the head" pass.
4. **Multi-user rooms** — share a look between two cameras, blend them. The substrate walker pattern, applied to two camera streams.
5. **Audio input** — let the engine listen to ambient noise and weight the atmosphere layer by loudness. The Director's name would become mood + sound.
6. **A real print mode** — the halftone engine could generate an actual printable file (PDF, SVG) instead of just rendering on screen.
7. **An ML engine** — train a tiny model on (image_patch, glyph) pairs and replace the Shape-match engine's Hamming distance with a learned distance. The cutting edge always is.

If you implement any of these, please open a PR. The format is intentionally simple.

---

## 20. Provenance

Built in one morning by a foreman agent and three GLM runners from a single dropped HTML file — the captain's. V1 is preserved byte-for-byte in [`mirror.html`](mirror.html), exactly as he sent it, `@@@@` redundancy and all. The archive rule here is the same as everywhere else in the fleet: **nothing good gets deleted, and the gold keeps its fingerprints.**

The lineage:

1. The captain (Casey) dropped `mirror.html` — a single-file ASCII renderer, simple, working.
2. A foreman agent (the keeper of fleet-seeds) read the Mirror, saw the bivariate extension waiting in the math, and wrote the Sculptor.
3. Two GLM runners — one in `quilt-jepa` land (latent), one in `mavis-essay-scout` land (witness) — composed the Studio and the Director in parallel.
4. A third GLM runner in `chiaroscuro` itself wrote the Viewfinder and the test harnesses.
5. The captain added the README, the recipes, the honest ledger, the provenance. (You are reading it.)
6. The fork of `mavis-essay-scout` produced the new essays you may see in AI-Writings; those essays are the canon, not the code. The code is the receipts. The essays are the witness.

The receipts in the chain: `mirror.html` is the seed. The 16 presets are the flowers. The 5 engines are the fruit. The Director's 24 names are the smell. You are standing in the orchard.

*The eye does the rest.*

---

## 21. Contributing, license, citation

### Contributing

PRs welcome. The format is intentionally simple: a single HTML file per door. The Studio is the largest. The Director is the most opinionated. The Mirror is the most honest.

If you add an engine, it must:

- Fit in the same single-pass cell loop (no async, no per-cell callbacks)
- Have at least one preset that ships in the Studio
- Have a name (a Director-nameable aesthetic move)
- Be honest about its cost (frame rate vs density)

If you add a dial, it must:

- Be meaningful (no "vibe" dials)
- Have a sensible default
- Pass a `?mock=1` Playwright test

If you add a preset, it must:

- Be the engine's natural habitat
- Be named for the aesthetic, not the engine
- Be exportable to `.json` and round-trippable

If you add a Director composition, it must:

- Clear the visibility floor
- Have a name that someone could imagine saying
- Be reproducible: the same input must give the same name

### License

MIT. The captain's. Same as the rest of the fleet.

### Citation

If chiaroscuro is useful in your work, cite as:

```bibtex
@misc{chiaroscuro,
  title={chiaroscuro: Real-time webcam-to-text rendering},
  author={the SuperInstance fleet},
  year={2026},
  howpublished={GitHub},
  note={https://github.com/SuperInstance/chiaroscuro}
}
```

Or, in plain English: "Built by a foreman and three GLM runners from a single dropped HTML file, 2026."

---

## 22. FAQ

**Q: Does chiaroscuro send my camera stream anywhere?**
A: No. Every door runs entirely in the browser. The camera stream never leaves your device. The hosted pages serve static HTML, JS, and CSS. The only network activity after the page loads is the optional Google Fonts preload.

**Q: Why is it called "chiaroscuro"?**
A: The 17th-century Italian technique of sculpting form out of light and dark alone. Caravaggio, Rembrandt, Vermeer. The alphabet is doing the same thing — making form visible without color, just by choosing the right shape per cell.

**Q: How is this different from ASCII art in `figlet` or `jp2a`?**
A: Three things: (1) it's *real-time* (camera → render at 30 fps), (2) it has *five engines* (not just a tone ramp), and (3) the export is a self-contained HTML file with your exact look baked in.

**Q: Can I use this for accessibility?**
A: Yes. The Braille engine produces dot-matrix Unicode (U+2800–U+28FF) which is read aloud by every screen reader. The whole frame is braille; the camera becomes a sonar.

**Q: Why no build step?**
A: Because the whole point is to ship a single HTML file that renders forever, in 2040, with no dependencies. Build steps are a tax on durability. The trade-off: you can't `npm install chiaroscuro`. You can `git clone https://github.com/SuperInstance/chiaroscuro` and open `studio.html` in a browser.

**Q: Why is the README so long?**
A: Because the doors are simple but the choice is not. The README is the answer to "what should I do with this?" It documents not just *how* but *why*. Substrate walker doctrine: receipts that explain themselves outlive receipts that don't.

**Q: Can I use this commercially?**
A: Yes. MIT. Use it for live performances, music videos, music tours, video art, surveillance art, security camera poetry, anything. The captain would be pleased.

**Q: Does the Director's name "Slow Neon Rain" mean anything?**
A: The Director composes a look and names it based on the parameters it selected. "Slow Neon Rain" is the name for a particular combination (low density, phosphor hue, slow trail decay, high grain). The name is the receipt; the parameters are the walk. The Director doesn't *mean* anything; the Director *reports* what it composed.

**Q: Where is the data?**
A: There is no data. The camera stream is processed in-memory and discarded. The Studio's settings are saved to JSON in your downloads. The Door I (Mirror) has no settings at all. The whole system is *stateless across runs* — the substrate walker pattern at the level of the artifact.

**Q: How do I add my own typeface?**
A: Either add it to the `FONT_MAP` object in `studio.html` (15-second change) or load a web font via `<link>` and add the family name to the dropdown. The Studio reads from `FONT_MAP`; the dropdown options are derived from the keys.

**Q: How do I add my own ramp?**
A: Use the **customRamp** dial (in the Grid & Glyphs group). Paste any string of 1–256 characters; the engine sorts them by ink ratio. The Fine ramp is generated exactly this way; you can see it in the source.

**Q: Can I drive chiaroscuro from another program?**
A: Yes. Every dial is in the URL. The JSON export is a flat object with the same shape as the URL hash. You can generate either programmatically. The terminal-app export is a Python file you can run with `pip install opencv-python`.

---

## 23. Glossary

- **Bivariate** — two variables. The Sculptor uses brightness and edge direction (two) instead of just brightness (one). Bivariate = the bivariate choice.
- **Bayer** — a 2×2 / 4×4 / 8×8 ordered dither matrix. Bayer dithering produces a regular, pattern-friendly threshold dither; it's the "right" default for text art because it doesn't shimmer the way random dither does.
- **Cell** — one character in the rendered output. The whole frame is N×M cells; each cell carries one brightness + one color + one glyph.
- **Chiaroscuro** — see top of README. The technique; the tool.
- **Door** — one of the five entry points. Mirror, Sculptor, Studio, Director, Viewfinder.
- **Engine** — the methodology for picking a glyph. Glyph, Sculpt, Pixel, Braille, Shape-match, Halftone.
- **Glyph** — the actual character drawn. `─ ╱ @ # .` etc.
- **Hamming distance** — for two bit-strings of equal length, the count of positions where they differ. Shape-match uses Hamming distance over 4×6 = 24-bit signatures.
- **Ink ratio** — the proportion of a glyph's pixels that are "ink" (not background). Used to sort ramps.
- **Luminance** — perceived brightness. The 1890s weights: 0.299 R + 0.587 G + 0.114 B.
- **Pixel** — the half-block photographic engine. Also: a single picture element. Context disambiguates.
- **Receipt** — one rendered frame. (The same word is used in the broader substrate walker pattern, where it means one sealed event in a chain. A chiaroscuro frame is a substrate walker receipt; a fleet witness log is a fleet receipt.)
- **Ramp** — an ordered list of glyphs sorted by ink ratio. The 70-step Fine ramp is the most useful; the original 10-step ramp is the historical default.
- **Sobel** — a 3×3 edge-detector kernel. `gx = (P(x+1,y-1) + 2·P(x+1,y) + P(x+1,y+1)) - (P(x-1,y-1) + 2·P(x-1,y) + P(x-1,y+1))`, similarly for `gy`. The Sculptor reads `(gx, gy)` per cell.
- **Stroke** — also called `?mock=1` mode. A synthetic camera stream. The mock is a stroke; the camera is a brush.
- **Substrate** — what the walker walks on. For chiaroscuro, the substrate is the camera frame. For the substrate walker pattern more broadly, the substrate is whatever the receipts are sealed to.
- **Substrate walker** — a thing that walks a substrate, emitting receipts. The engine, the camera loop, and the Director are all substrate walkers.
- **Typeface** — the font. The 31 typefaces in the Studio are the alphabet the engine reads from.
- **Variance** — a one-pass stat: the average squared deviation from the cell's mean. Used by Halftone and Braille-blend to weight the cell's content.

---

## 24. Cross-pollination — the Reader's Fold

*Part of the **quilt** family. Under [Law 6](https://github.com/SuperInstance/jev-quilt), this repo carries no verdicts about its neighbors — only content-addressed pointers you fold under your own weights.*

**Provides** (fold these from here)
- `renderer-core` — four real-time webcam-to-text renderers (Mirror/Sculptor/Studio/Director), five glyph-choice engines, one shared pipeline (downsample → brightness → edge → character → color → atmosphere)
- `repertoire-of-names` — the Director's ~24 named aesthetic compositions (Feral Silhouette, Slow Neon Rain, Low Kiln, Glass Hour, Damp Print, Pine Smoke, ...)
- `export-as-html` — pattern for turning a tuned-in-browser app into a self-contained, no-build, no-network file with boot state baked in
- `export-as-terminal` — pattern for shipping the same decision procedure to a Python+OpenCV terminal renderer
- `mock-mode` — `?mock=1` synthetic camera stream for machine-playtesting and headless demos

**Folds from neighbors** (when you render this repo from a wider lens, you may want to include)
- `quilt-jepa`'s prediction-based rendering style
- `mavis-essay-scout`'s voice-decomposition (the Director names, the engines execute — the same split as a 4-voice chord)
- `fleet-seeds/tavern/`'s keeper voice for the honest ledger

<sub>Regenerate: `node quilt-links.mjs` · Fleet map: [FLEET.md](https://github.com/SuperInstance/fleet-seeds/blob/main/FLEET.md)</sub>

---

*"The eye does the rest." — applied to the alphabet in 2026 as it was applied to the canvas in 1600.*
