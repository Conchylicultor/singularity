import { defineConfig } from "@plugins/config/core";

export const promptTemplatesConfig = defineConfig({
  pinnedCount: {
    default: 5,
    label: "Pinned templates",
    description:
      "Number of templates shown as persistent chips in the prompt editor toolbar.",
  },
});
