import { defineConfig } from "@plugins/config/core";

export const typographyConfig = defineConfig({
  preset: { default: "default", label: "Typography preset" },
  overrides: { default: "{}", label: "Typography overrides" },
});
