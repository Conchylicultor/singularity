import { defineConfig } from "@plugins/config/core";

export const shadowConfig = defineConfig({
  preset: { default: "default", label: "Shadow preset" },
  overrides: { default: "{}", label: "Shadow overrides" },
});
