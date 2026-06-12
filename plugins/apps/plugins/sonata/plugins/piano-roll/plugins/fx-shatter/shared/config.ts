import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";

// Fancy tier — opt-in, default OFF.
export const fxShatterConfig = defineConfig({
  fields: {
    enabled: boolField({
      label: "Note shatter",
      description:
        "Each note bursts into small tinted debris that arcs up and falls away at the keyboard line.",
      default: false,
    }),
  },
});
