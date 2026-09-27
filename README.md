# chiaroscuro

**chiaroscuro** *n.* — 17th-century Italian: *chiaro* (clear) + *scuro* (obscure). The technique of sculpting form out of light and dark alone. Caravaggio didn't have outlines; he had contrast, and the eye did the rest.

Four hundred years later, a webcam, an alphabet, and a per-cell decision.

---

## What this is

Four real-time renderers that turn a camera into living text. Each one answers the same question differently: *when a pixel becomes a character, what should the character know?*

| Door | What it knows | Live |
|---|---|---|
| **The Mirror** | brightness. One ramp, sixteen steps, your color. | [open](https://fleet-static-host.casey-digennaro.workers.dev/mirror/) |
| **The Sculptor** | brightness **and** edge direction — Sobel angle picks `─ ╱ │ ╲`, magnitude picks the weight, a virtual light embosses the relief. Braille subpixels (⣿ = 8 dots/cell) where variance is high. | [open](https://fleet-static-host.casey-digennaro.workers.dev/mirror2/) |
| **The Studio** | everything above, exposed: 30+ parameters, 12 presets, dither, duotone, grain, bloom. Includes both ancestors as presets. | [open](https://fleet-static-host.casey-digennaro.workers.dev/studio/) |
| **The Director** | nothing you control. An aesthetic engine reads the scene's motion and light, composes its own look, names it, and moves on when the scene does. | [open](https://fleet-static-host.casey-digennaro.workers.dev/director/) |

No frameworks. No build step. One HTML file per door. View source is the documentation.

---

## The one idea

> **Characters are shapes, not pixels.**

The 2026 state of the art stopped mapping brightness to ink density and started asking what each glyph *depicts*. A cheekbone is not a smudge of gray; it is a slope. So the Sculptor runs a Sobel gradient per cell and renders the slope: `─` for a horizontal face, `╱` for a diagonal one, `║` for a wall. The bivariate pick — angle for the glyph, magnitude for its weight, emboss lighting for the paint — is what turns "ASCII filter" into "relief map of a face."

Everything else is that idea, taken seriously, at various depths.

---

## Honest ledger

Failures first-class, as they should be:

- **The first Mirror was the most pleasant to look at.** The Sculptor knows more and feels less — edge glyphs fragment smooth skin into hatchwork. Verdict after side-by-side human testing (n=1, the captain): resolution of *meaning* ≠ resolution of *tone*. The Studio exists so you can find your own point on that line; the Director exists because someone will refuse to turn knobs at all.
- **Braille at low density reads dotty.** 2×4 subpixels want small cells. A half-block (`▀▄`) blend is the noted next move, not done yet.
- **The Director occasionally composes a scene that is technically valid and completely dark.** Palettes got a visibility floor after one "Slow Neon Rain" rendered zero photons. The fix is a clamp, not a taste — the next lesson is teaching it restraint before confidence.
- **Portrait cameras squish.** Rows derive from the stream's aspect ratio, not its orientation. Known, unfixed, cosmetic.

## Engineering notes

- Single-pass cell loop: Sobel, variance, and tone in one read of one small `getImageData` buffer. ~100×60 cells at 18–30fps in plain JS on integrated graphics.
- Luminance uses the 0.299/0.587/0.114 perception weights — 1890s television wisdom, still the correct 2026 default.
- The Mirror's original ramp wasted its top quarter on eight identical `@`s. The Fine ramp (70 levels) exists because of that receipt.
- All four doors accept `?mock=1`: a synthetic scene (moving light, shaded sphere, rotated bars, checkerboard) so the render path can be exercised — and machine-play-tested — with no camera at all. Test harnesses in [`tools/`](tools/).

---

## Provenance

Built in one morning by a foreman agent and three GLM runners from a single dropped HTML file — the captain's. V1 is preserved byte-for-byte in [`mirror.html`](mirror.html), exactly as he sent it, `@@@@` redundancy and all. The archive rule here is the same as everywhere else in the fleet: **nothing good gets deleted, and the gold keeps its fingerprints.**

*The eye does the rest.*
