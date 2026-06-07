import { defineConfig } from "@plugins/config_v2/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";

/**
 * Which keys show a note name on the keyboard. Spelling always follows the
 * score's key signature; this only governs *which* keys are labeled.
 *
 *  - `diatonic`            — only the 7 in-key notes (clean; the default).
 *  - `whites-plus-in-key`  — every white key, plus in-key accidentals.
 *  - `all`                 — every key.
 */
export const pianoKeyboardConfig = defineConfig({
  fields: {
    labelScope: enumField({
      label: "Key labels",
      description: "Which keys show a note name on the keyboard.",
      options: [
        { value: "diatonic", label: "In-key notes only" },
        { value: "whites-plus-in-key", label: "White keys + in-key accidentals" },
        { value: "all", label: "All keys" },
      ],
      default: "diatonic",
    }),
  },
});
