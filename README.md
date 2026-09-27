# chiaroscuro

**chiaroscuro** *n.* — 17th-century Italian: *chiaro* (clear) + *scuro* (obscure). The technique of sculpting form out of light and dark alone. Caravaggio didn't have outlines; he had contrast, and the eye did the rest.

Four hundred years later: a webcam, an alphabet, and a per-cell decision.

**Live doors** (hosted, no install, camera stays on your device):
[Ⅰ Mirror](https://fleet-static-host.casey-digennaro.workers.dev/mirror/) ·
[Ⅱ Sculptor](https://fleet-static-host.casey-digennaro.workers.dev/mirror2/) ·
[Ⅲ Studio](https://fleet-static-host.casey-digennaro.workers.dev/studio/) ·
[Ⅳ Director](https://fleet-static-host.casey-digennaro.workers.dev/director/)

---

## Contents

1. [What this is](#what-this-is)
2. [The one idea](#the-one-idea)
3. [A two-minute history of drawing with letters](#a-two-minute-history-of-drawing-with-letters)
4. [How a frame becomes text](#how-a-frame-becomes-text)
5. [The four doors](#the-four-doors)
6. [The Studio: five engines, forty-five dials](#the-studio-five-engines-forty-five-dials)
7. [Exporting your renderer](#exporting-your-renderer)
8. [Honest ledger](#honest-ledger)
9. [Engineering notes](#engineering-notes)
10. [Provenance](#provenance)

---

## What this is

Four real-time renderers that turn a camera into living text. Each one answers the same question differently:

> *When a pixel becomes a character, what should the character know?*

No frameworks. No build step. One HTML file per door. View source is the documentation.

---

## The one idea

> **Characters are shapes, not pixels.**

For most of its history, ASCII art treated letters as ink quantities: bright pixel, light letter; dark pixel, dense letter. That works, and it's where we start. But it throws away the thing letters are actually good at — having a *shape*.

A cheekbone is not a smudge of gray. It is a slope. So the Sculptor runs a gradient test on every cell of the image and renders the slope: `─` for a horizontal face, `╱` for a diagonal one, `║` for a wall. The pick is *bivariate* — angle chooses the glyph, magnitude chooses its weight, and a virtual light source embosses the paint. That combination is what turns "an ASCII filter" into "a relief map of a face."

Everything else in this repo is that one idea, taken seriously, at increasing depths.

---

## A two-minute history of drawing with letters

A little context makes the renderers more fun to use, so here's the family tree:

- **1960s–70s — the teletype era.** Computers had only line printers, so people drew with what the printer had: overprinting characters to fake gray levels. The famous "ASCII art" posters of the era are this trick done with patience.
- **1970s–80s — the ramp gets smart.** Artists noticed that not all letters carry equal ink: `.` is almost nothing, `@` is almost everything. Order them by visual density — ` .:-=+*#%@` — and you get a *tone ramp*, a grayscale with only ten steps that the eye happily reads as smooth. Our Mirror runs a seventy-step version.
- **The 1890s plot twist.** Long before computers, engineers worked out that the human eye doesn't weight colors equally: green contributes most to perceived brightness, blue almost nothing. The weights `0.299 R + 0.587 G + 0.114 B` were standardized for early television and are *still the correct default* in 2026. Every door here uses them. Some math gets old; perception doesn't.
- **The half-block hack.** Text terminals could only draw rectangular glyphs — until someone noticed `▀` (upper half block) lets each text row carry *two* image rows: color the top half with one pixel's color, the bottom with another's. Instantly double vertical resolution with the same grid. Our Pixel engine is this trick, 45 years old, still undefeated.
- **Braille as a bitmap.** Braille cells pack 8 dots into a 2×4 grid with a clean Unicode encoding (`U+2800` + a bitmask). That's a tiny 8-pixel bitmap with a font already installed on every modern OS. Our Braille engine is literally a grayscale image decoded into dot-matrix Unicode.
- **The 2026 state of the art — shape matching.** The newest question in the field: instead of *how much ink* or *which slope*, ask **which letter looks most like this patch of image?** Rasterize your glyph set once into tiny bitmaps, then for each cell compare the image patch against every glyph bitmap and keep the best match. It's template matching — the oldest trick in computer vision — pointed at an alphabet. Our Shape-match engine does exactly this, with Hamming distance over 4×6 signatures.

Chiaroscuro contains all five generations, side by side, because each one is a different answer to "what should the character know?"

---

## How a frame becomes text

Every door runs the same pipeline, roughly 60 times a second. Once you've seen it, every knob in the Studio will make sense:

1. **Downsample.** The camera frame is squashed onto a tiny buffer — one pixel per character cell. At 100 columns, your webcam becomes a 100×75 image. This is the whole trick: text art is just a *very small* image with a *very expressive* palette.
2. **Measure brightness.** Each cell gets its luminance (the 1890s weights), then contrast, gamma, and black/white points shape it — same sliders your photo editor has, for the same reasons.
3. **Measure change.** A Sobel gradient looks at each cell's neighbors and asks: which direction is brightness changing, and how fast? Flat regions and edges separate here.
4. **Choose the character.** This is where the engines disagree (see below). Tone picks a ramp glyph; edges pick a slope glyph; the Pixel engine picks two colors; the Shape-match engine runs an election.
5. **Choose the color.** The cell's original color can pass through untouched, be forced into a single "phosphor" hue like an old terminal, or be remapped to a two-color duotone — Renaissance printing, meet your webcam.
6. **Add the room.** Scanlines, grain, vignette, bloom, glitch — the atmosphere layer. None of it carries image information; all of it carries *mood*. That's not waste, that's set design.

---

## The four doors

| Door | What it knows | Best for |
|---|---|---|
| **Ⅰ The Mirror** | brightness. One ramp, your color. Nothing else. | Seeing yourself honestly. The lake test: any new engine is judged side-by-side against this one. |
| **Ⅱ The Sculptor** | brightness **and** edge direction. Sobel angle picks `─ ╱ │ ╲`, magnitude picks the weight, a virtual light embosses the relief, and braille subpixels fill high-variance patches. | Faces, hands, anything with form worth carving. |
| **Ⅲ The Studio** | everything above, exposed: five engines, 45+ parameters, 16 presets, dither, duotone, trails, glitch, grain, bloom. | Finding *your* version of good — then exporting it. |
| **Ⅳ The Director** | nothing you control. An aesthetic engine reads the scene's motion and light, composes its own look, names it (*"Feral Silhouette," "Low Kiln"*), and moves on when the scene does. | Letting go. Also: parties. |

---

## The Studio: five engines, forty-five dials

The Studio is the tool of the family. Its engine selector swaps the *entire methodology*, not just parameters:

- **Glyph** — the bivariate tone/edge/braille core. The Sculptor, with every dial exposed.
- **Pixel** — half-block photographic. `▀` with a different color per half-row, 2× vertical resolution. Start from the *Silver Halide* preset: desaturated, grained, black-point pushed — it's film.
- **Braille** — a pure 2×4 dot image. No glyphs at all, eight subpixels per cell. *Dotscape* shows it in violet duotone.
- **Shape-match** — template-matched glyphs. Each cell's patch is compared against every ramp glyph rasterized to a 4×6 bitmap; the closest match (Hamming distance) wins. The renderer literally asks *"which letter looks most like this patch?"* *Woodcut Match* renders like a block print.
- **Halftone** — ink dots with radius driven by brightness. A newspaper press for your face.

Around the engines, the dials cover every stage of the pipeline: edge detector choice (Sobel, emboss, Laplacian) and edge paint; black/white points, posterize, dot gain, dither; color temperature, duotone, heatmap, phosphor hue; trails (phosphor persistence), temporal blending, glitch strips; kaleidoscope, zoom, jitter; five typefaces and nine ramps — including a custom ramp field, because your alphabet should be yours.

Sixteen presets, and both ancestors are in there as ① The Original and ② The Sculptor — you can stand exactly where the project stood at door one, with every dial around you.

One honest note: **Shape-match is the slowest engine** (~20fps at high density). Comparing 70 glyph bitmaps per cell costs real cycles, so its presets pin a lower density. Fast engines for motion, slow engines for portraits.

## Exporting your renderer

This is the part that makes the Studio a tool instead of a toy.

Once you've dialed in something that's *yours* — the exact good you picked — press the gold button:

> **⇩ EXPORT RENDERER .HTML**

You get a download of *this exact application* with your settings baked in as its boot state and the control panel stripped out. One self-contained file, no dependencies, no network, no build step. Open it anywhere and it renders forever in your look.

It earns the word "renderer": what you tuned wasn't a filter preset, it was the decision procedure — which engine measures what, and how the frame becomes text. The export *is* that procedure, frozen.

There are also **⇩ SETTINGS .JSON** (just the numbers, portable) and **⇧ LOAD** (apply a settings file), plus **⇪ SHARE LINK** (settings encoded in the URL — the link is the preset).

---

## Honest ledger

Failures first-class, as they should be:

- **The first Mirror was the most pleasant to look at.** The Sculptor knows more and feels less — edge glyphs fragment smooth skin into hatchwork. Verdict after side-by-side human testing (n=1, the captain): resolution of *meaning* ≠ resolution of *tone*. The Studio exists so you can find your own point on that line; the Director exists because someone will refuse to turn knobs at all.
- **The Director occasionally composes a scene that is technically valid and completely dark.** Palettes got a visibility floor after one *"Slow Neon Rain"* rendered zero photons. The fix is a clamp, not a taste — the next lesson is teaching it restraint before confidence.
- **Braille at low density reads dotty.** 2×4 subpixels want small cells. The full-braille engine (Studio) wants dense grids; at coarse grids, use the Glyph engine's braille-blend instead.
- **Shape-match pays for its sophistication.** 70 template comparisons per cell per frame. ~20fps at high density. The cutting edge always is.
- **Portrait cameras squish.** Rows derive from the stream's aspect ratio, not its orientation. Known, unfixed, cosmetic.
- **The Fine ramp is 70 levels nobody can name.** It looks gorgeous, but when someone asks "why is my face made of `rxnuvcz`," the honest answer is: those glyphs landed there because they carry exactly that much ink. Poetry by arithmetic.

## Engineering notes

- Single-pass cell loop: Sobel, variance, and tone computed in one read of one small `getImageData` buffer. ~100×75 cells at 18–30fps in plain JS on integrated graphics.
- Shape-match signatures are cached per (typeface, ramp) pair — glyphs rasterize once to 4×6 offscreen bitmaps, then every frame is pure comparison.
- The Pixel and Braille engines keep a second, taller buffer (`cols × rows*2` and `cols*2 × rows*4`) because sub-row resolution is the entire point.
- The Mirror's original ramp wasted its top quarter on eight identical `@`s. The Fine ramp exists because of that receipt.
- All doors accept `?mock=1`: a synthetic scene (moving light, shaded sphere, rotated bars, checkerboard) so the render path can be exercised — and machine-play-tested — with no camera at all. Test harnesses live in [`tools/`](tools/); the Studio's five engines and the export path are all covered.
- The Studio's export works by fetching its own source, injecting your settings as a boot-state object, and hiding the panel with one CSS rule. The export is the app. That's the whole mechanism, and it's deliberately that simple.

---

## Provenance

Built in one morning by a foreman agent and three GLM runners from a single dropped HTML file — the captain's. V1 is preserved byte-for-byte in [`mirror.html`](mirror.html), exactly as he sent it, `@@@@` redundancy and all. The archive rule here is the same as everywhere else in the fleet: **nothing good gets deleted, and the gold keeps its fingerprints.**

*The eye does the rest.*
