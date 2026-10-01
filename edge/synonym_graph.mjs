// GENERATED from edge/synonym_graph.json — do not edit by hand.
// Regenerate: node -e '(require graph gen one-liner — see tools/nl_parity.mjs pin 1)'
// Pin: tools/nl_parity.mjs recomputes sha256(synonym_graph.json) and refuses
// any drift between this module and the canonical JSON.
export const GRAPH_SHA256 = "b57f29b0b2c4c2a760325a7ee05f6b3cc27a0a7217a19ad269f6d7de98cff393";
export const GRAPH = {
  "_meta": {
    "name": "chiaroscuro-edge-synonym-graph v1",
    "date": "2026-10-01",
    "pre_registered": "receipts/lane-c-edge.md R2 hypothesis — committed BEFORE the measured run that cites it (R1)",
    "target": ">=0.85 top-1 on edge/eval_prompts.json (pinned sha256 32a35de2...)",
    "baseline": "keyword table = 0.560 (tools/edge_eval_receipt.json)",
    "canonical_implementation": "edge/nl_route.js (node); worker.ts is a mirror pinned by tools/nl_parity.js"
  },
  "config": {
    "weights": {
      "strong": 2,
      "medium": 1.5,
      "weak": 1
    },
    "route_threshold": 1,
    "fuzzy_edit_distance": 1,
    "fuzzy_min_term_len": 4,
    "negation_window_words": 2,
    "negation_markers": [
      "not",
      "n't",
      "never",
      "no"
    ],
    "but_pivot_multiplier": 1.5,
    "tiebreak": "equal scores -> class whose FIRST matched term appears EARLIEST in the prompt"
  },
  "classes": {
    "woodcut": {
      "dials": {
        "contrast": 1.8,
        "blackPoint": 0.4,
        "trailDecay": 0.4,
        "edgePaint": 0.9
      },
      "terms": {
        "strong": [
          "woodcut",
          "carve",
          "carved",
          "carving",
          "engraving",
          "engraved",
          "woodblock",
          "linocut"
        ],
        "medium": [
          "gouge",
          "gouged",
          "chisel",
          "chiseled",
          "etching",
          "incised",
          "block print",
          "relief print"
        ],
        "weak": [
          "oak",
          "copper plate",
          "cuts"
        ]
      }
    },
    "terminal": {
      "dials": {
        "contrast": 1.4,
        "blackPoint": 0.25,
        "trailDecay": 0.8,
        "edgePaint": 0.1
      },
      "terms": {
        "strong": [
          "terminal",
          "phosphor",
          "crt",
          "lo-fi",
          "lofi",
          "retro",
          "scanlines",
          "scanline",
          "amber"
        ],
        "medium": [
          "computer screen",
          "screen glow",
          "monitor",
          "bloom",
          "green screen",
          "command line"
        ],
        "weak": [
          "vga",
          "ansi"
        ]
      }
    },
    "soft": {
      "dials": {
        "contrast": 0.9,
        "blackPoint": 0.05,
        "trailDecay": 0.9,
        "edgePaint": 0
      },
      "terms": {
        "strong": [
          "soft",
          "ambient",
          "misty",
          "haze",
          "hazy",
          "dreamy",
          "gentle",
          "gently",
          "diffuse",
          "cotton-wool"
        ],
        "medium": [
          "fog",
          "foggy",
          "mist",
          "quiet",
          "ethereal",
          "delicate",
          "serene",
          "bleak"
        ],
        "weak": [
          "glow",
          "calm"
        ]
      }
    },
    "harsh": {
      "dials": {
        "contrast": 2.1,
        "blackPoint": 0.5,
        "trailDecay": 0.2,
        "edgePaint": 1
      },
      "terms": {
        "strong": [
          "harsh",
          "noir",
          "hard",
          "brutal",
          "stark",
          "severe",
          "unforgiving",
          "bleached"
        ],
        "medium": [
          "crushed blacks",
          "crushed black",
          "deep shadow",
          "high contrast",
          "hard light",
          "hard shadow",
          "punishing"
        ],
        "weak": [
          "exposure",
          "detective",
          "dramatic",
          "cold"
        ]
      }
    }
  },
  "default_dials": {
    "contrast": 1.3,
    "blackPoint": 0.15,
    "trailDecay": 0.5,
    "edgePaint": 0.3
  }
};
