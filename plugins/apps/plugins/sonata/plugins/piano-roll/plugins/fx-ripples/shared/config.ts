import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";

// Fancy tier — opt-in, default OFF.
export const fxRipplesConfig = defineConfig({
  fields: {
    enabled: boolField({
      label: "Sound-wave ripples",
      description:
        "Expanding ripple rings radiate from each note strike along the keyboard line.",
      default: false,
    }),
  },
});
