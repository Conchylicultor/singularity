import { defineConfig } from "@plugins/config/core";

export const turnSummaryConfig = defineConfig({
  enabled: {
    default: true,
    label: "Turn summaries",
    description:
      "Automatically generate a Haiku summary of each assistant turn — shows a one-liner, caveats, and suggested actions above the prompt input.",
  },
});
