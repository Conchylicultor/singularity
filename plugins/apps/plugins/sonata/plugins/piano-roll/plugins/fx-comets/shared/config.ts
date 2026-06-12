import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";

// Fancy tier — opt-in, default OFF.
export const fxCometsConfig = defineConfig({
  fields: {
    enabled: boolField({
      label: "Pitch comets",
      description:
        "A comet arcs along the keyboard line from each track's previous note to its next, tracing the melody's motion.",
      default: false,
    }),
  },
});
