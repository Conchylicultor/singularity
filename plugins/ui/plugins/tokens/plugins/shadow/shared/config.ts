import { defineConfig } from "@plugins/config/core";

export const shadowConfig = defineConfig({
  preset: { default: "default", label: "Shadow preset" },
  params: { default: "{}", label: "Shadow params overrides" },
  overrides: { default: "{}", label: "Shadow overrides" },
});
