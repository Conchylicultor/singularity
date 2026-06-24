import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";
import { floatField } from "@plugins/fields/plugins/float/plugins/config/core";
import { VOICINGS, DEFAULT_VOICING_ID } from "./voicing";

/**
 * Global chord-voicing settings, shared across every symbol-based source
 * (chord-grid, Ultimate Guitar, …). A single global config_v2 (like the FX
 * toggles / showNoteNames), read reactively by the shell's re-voicing step.
 *
 *  - `realistic` — voice-lead each chord to the nearest inversion of the
 *    previous one and add a low bass root (ON by default).
 *  - `strategyId` — which rhythm strategy renders the voiced pitches.
 *  - `octave` — base octave for the voiced chord.
 */
export const voicingConfig = defineConfig({
  fields: {
    realistic: boolField({ label: "Realistic voicing", default: true }),
    strategyId: enumField({
      label: "Voicing",
      options: VOICINGS.map((v) => ({ value: v.id, label: v.label })),
      default: DEFAULT_VOICING_ID,
    }),
    octave: floatField({ label: "Octave", default: 4, min: 1, max: 7, step: 1 }),
  },
});
