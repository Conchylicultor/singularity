import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { floatField } from "@plugins/fields/plugins/float/plugins/config/core";

/**
 * Global chord-voicing placement settings, shared across every symbol-based
 * source (chord-grid, Ultimate Guitar, …). A single global config_v2 (like the FX
 * toggles / showNoteNames), read reactively by the shell's re-voicing step.
 *
 *  - `realistic` — voice-lead each chord to the nearest inversion of the
 *    previous one and add a low bass root (ON by default).
 *  - `octave` — base octave for the voiced chord.
 *
 * The tone-order (which figuration each hand plays) is NOT a global knob: it is
 * per-song and bundled with the rhythm groove (see the per-hand figuration
 * plan), so the old global `strategyId` is gone.
 */
export const voicingConfig = defineConfig({
  fields: {
    realistic: boolField({ label: "Realistic voicing", default: true }),
    octave: floatField({ label: "Octave", default: 4, min: 1, max: 7, step: 1 }),
  },
});
