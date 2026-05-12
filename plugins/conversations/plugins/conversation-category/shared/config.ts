import { defineConfig } from "@plugins/config/core";

export const conversationCategoryConfig = defineConfig({
  autoClassify: {
    default: true,
    label: "Auto-classify with Haiku",
    description:
      "Automatically classify conversations into categories after each assistant turn. Manual re-classify is always available from the toolbar chip.",
  },
  categories: {
    default: [
      "General question",
      "Small feature",
      "Load bearing infra",
      "Bug",
      "Other",
    ] as string[],
    label: "Conversation categories",
    description:
      "Labels Haiku can pick from when classifying a conversation. Reorder freely; the last label is also the fallback when Haiku's reply doesn't match any entry, so a catch-all (e.g. \"Other\") at the end is recommended.",
  },
});
