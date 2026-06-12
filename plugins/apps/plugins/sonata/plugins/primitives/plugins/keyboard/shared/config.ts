import { defineConfig } from "@plugins/config_v2/core";
import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";

/**
 * How the piano keys are drawn. The keyboard primitive owns this so the choice
 * applies *everywhere* a keyboard renders (the full 88-key roll keyboard and the
 * chord / key readout chips) from a single toggle — the primitive reads it
 * itself rather than threading a prop through every consumer.
 *
 *  - `flat`       — Synthesia-style: solid fills, strong dark white-key borders,
 *                   and a lit key painted in the note's actual color (no
 *                   translucent tint). The default.
 *  - `realistic`  — skeuomorphic ivory/ebony with gradients, bevels, gloss, and
 *                   a pressed-key depression.
 */
export type KeyStyle = "flat" | "realistic";

export const keyboardStyleConfig = defineConfig({
  fields: {
    keyStyle: enumField({
      label: "Key style",
      description: "How the piano keys are drawn.",
      options: [
        { value: "flat", label: "Flat (Synthesia)" },
        { value: "realistic", label: "Realistic" },
      ],
      default: "flat",
    }),
  },
});
