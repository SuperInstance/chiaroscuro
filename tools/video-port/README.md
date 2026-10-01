# video-port — the Studio, carried out of the browser

`port-video.mjs` is the Studio's full parameter surface as an offline CLI: point it at a
video file, and ffmpeg hands frames to pure Node, which renders each one as text through
the same pipeline the live doors run — downsample, measure brightness (the 1890s weights),
measure change, choose the character, choose the color, add the room. No npm dependencies,
Node ≥ 20, ffmpeg spawned in list form only. No shells were harmed or used.

```sh
node tools/video-port/port-video.mjs input.mp4 --engine sculpt --colorMode phosphor \
  --phosphorHue 120 --cols 100 --fps 12 --out port.ans --manifest
```

## Engines

Per the repo README §6, plus the Sculptor's own: **glyph** (ramp by luminance),
**sculpt** (Sobel angle → `─╱│╲`, magnitude → weight, virtual light emboss, high-variance
patches dissolving into braille), **pixel** (`▀` half-blocks, two image rows per text row,
truecolor), **braille** (U+2800 + bitmask over a 2×4 patch), **shapematch** (4×6 template
bitmaps, Hamming-distance election per cell), **halftone** (dot-density approximation —
see the honest notes below).

## The dial manifest

Every dial the Studio exposes is a flag — grid (`cols`, `rows`, ramps incl. the 70-step
*fine* and the double-`@` *classic*), image (`blackPoint` … `dither`), sculpt
(`edgeDetector`, `lightAngle`, `varianceBlend`…), color (`phosphor`, `duotone`,
`heatmap`, `ink`), motion (`trails`, `temporalBlend`, `glitch`), atmosphere (`scanlines`,
`grain`, `vignette`, `bloom`, `kaleidoscope`, `zoom`), plus the porter's own (`fps`,
`seek`, `duration`, `frameRange`, `out`, `format txt|ans|html`). `--params file.json`
overrides any flag — JSON wins. `--manifest` writes a `chiaroscuro-port/v1` sidecar with
every resolved dial, the input's sha256, and the extracted/rendered frame counts:
**the parameter manifest IS the record of the port.** Re-render any output, ever, from
input + manifest alone.

## Honest notes (the porter's ledger)

- **halftone** is approximated: the Studio draws real ink circles; a text cell can only
  carry dot-density glyphs (`·∙•●`). Ink quantity, not geometry.
- **shapematch** templates are hand-drawn 4×6 bitmaps for a curated alphabet — the Studio
  rasterizes its live typeface; offline Node has no font rasterizer without dependencies.
- **typefaces** ride as CSS in html output only. txt/ans use the terminal's own font;
  the manifest records the choice either way.
- Trails, temporal blending, and glitch keep state across consecutive frames — phosphor
  behaves like phosphor.
- Fail-loud throughout: unknown flags list the whole surface; ffmpeg stderr passes
  through; extracted vs rendered frame counts are printed and never allowed to drift.

— added by the porter agent, 2026-09-30
