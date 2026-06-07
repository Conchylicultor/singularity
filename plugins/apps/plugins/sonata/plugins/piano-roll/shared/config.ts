import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";

/**
 * Piano-roll display options.
 *
 *  - `showNoteNames` — render each falling bar's note name inside it
 *    (Synthesia-style). Spelling follows the score's key signature, so
 *    accidentals read in the key the song is written in (Eb vs D#).
 */
export const pianoRollConfig = defineConfig({
  fields: {
    showNoteNames: boolField({
      label: "Note names in bars",
      description: "Show each note's name inside its falling bar, like Synthesia.",
      default: false,
    }),
  },
});
