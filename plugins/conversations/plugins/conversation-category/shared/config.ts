import { defineConfig } from "@plugins/config/shared";

export const conversationCategoryConfig = defineConfig({
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
