import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";

export const turnSummaryConfig = defineConfig({
  fields: {
    enabled: boolField({
      default: true,
      label: "Turn summaries",
      description:
        "Automatically generate a Haiku summary of each assistant turn — shows a one-liner, caveats, and suggested actions above the prompt input.",
    }),
  },
});
