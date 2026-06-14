import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { floatField } from "@plugins/fields/plugins/float/plugins/config/core";

/**
 * Piano-roll display options.
 *
 *  - `showNoteNames` — render each falling bar's note name inside it
 *    (Synthesia-style). Spelling follows the score's key signature, so
 *    accidentals read in the key the song is written in (Eb vs D#).
 *  - `spread` — vertical zoom of the falling notes. The persisted DEFAULT/
 *    committed value; the live value is ephemeral transport state the toolbar
 *    jog-wheel and pinch/scroll gestures drive (see the Sonata context's
 *    `spread`). Bounds mirror the geometry's `SPREAD_MIN`/`SPREAD_MAX`; kept as
 *    literals here because `shared/` can't import the web geometry module.
 */
export const pianoRollConfig = defineConfig({
  fields: {
    showNoteNames: boolField({
      label: "Note names in bars",
      description: "Show each note's name inside its falling bar, like Synthesia.",
      default: false,
    }),
    spread: floatField({
      label: "Note spread (zoom)",
      description:
        "Vertical zoom of the falling notes (1 = default). Higher spreads them out, Synthesia-style. Drag the toolbar wheel or pinch / Ctrl+scroll over the roll to adjust.",
      default: 1,
      min: 0.4,
      max: 3,
      step: 0.05,
    }),
  },
});
