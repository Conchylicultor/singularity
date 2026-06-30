import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";

/**
 * Notation display options.
 *
 *  - `showChordSymbols` — print each measure's chord symbol above the treble
 *    staff (from the score's `chord` annotations), so the staff reads as a
 *    lead sheet when chords are present.
 *  - `splitPitch` — the MIDI pitch at/above which a note is engraved on the
 *    treble staff; below it goes to the bass staff. Default 60 (middle C). v1
 *    uses a single voice per staff with this fixed split (documented caveat).
 */
export const notationConfig = defineConfig({
  fields: {
    showChordSymbols: boolField({
      label: "Chord symbols",
      description: "Print chord symbols above the staff when the score has them.",
      default: true,
    }),
    splitPitch: intField({
      label: "Treble / bass split",
      description:
        "MIDI pitch at or above which notes go to the treble staff (60 = middle C).",
      default: 60,
      min: 21,
      max: 108,
      step: 1,
    }),
  },
});
