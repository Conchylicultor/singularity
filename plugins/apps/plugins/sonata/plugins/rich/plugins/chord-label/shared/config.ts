import { defineConfig } from "@plugins/config_v2/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";

/**
 * The single shared preference for how chords are labeled across Sonata's chord
 * surfaces — the piano-roll overlay and the progression strip render identically
 * under this one mode:
 *
 *  - `symbol` — the chord symbol only (`C`); the default, preserving today's look.
 *  - `roman` — the Roman-numeral function only (`I`).
 *  - `both` — the symbol with its numeral in parentheses (`C (I)`).
 *
 * The numeral is derived per-surface from the key in force at each chord's onset
 * (see `formatChordLabel` in `theory/core`); this config carries only the mode.
 */
export const chordLabelConfig = defineConfig({
  fields: {
    mode: enumField({
      label: "Chord labels",
      description: "How chords are labeled on the piano roll and progression.",
      options: [
        { value: "symbol", label: "Chord — C" },
        { value: "roman", label: "Numeral — I" },
        { value: "both", label: "Both — C (I)" },
      ],
      default: "symbol",
      display: "radio",
    }),
  },
});
