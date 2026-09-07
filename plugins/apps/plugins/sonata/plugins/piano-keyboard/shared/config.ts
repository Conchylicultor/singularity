import { defineConfig } from "@plugins/config_v2/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";

/**
 * Which keys show a note name on the keyboard. Spelling always follows the
 * score's key signature; this only governs *which* keys are labeled.
 *
 *  - `diatonic`            — only the 7 in-key notes (clean; the default).
 *  - `whites-plus-in-key`  — every natural, plus in-key accidentals.
 *  - `all`                 — every key.
 *
 * The middle VALUE keeps its "whites" spelling although the label no longer says
 * it: `enumField` builds its `z.enum` from these values and config_v2 has no
 * migration, so renaming one would silently drop every user's setting.
 */
export const pianoKeyboardConfig = defineConfig({
  fields: {
    labelScope: enumField({
      label: "Key labels",
      description: "Which keys show a note name on the keyboard.",
      options: [
        { value: "diatonic", label: "In-key notes only" },
        {
          value: "whites-plus-in-key",
          label: "Naturals + in-key accidentals",
        },
        { value: "all", label: "All keys" },
      ],
      default: "diatonic",
    }),
  },
});
