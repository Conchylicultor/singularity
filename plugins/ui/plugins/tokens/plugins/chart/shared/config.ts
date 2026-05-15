import { defineConfig } from "@plugins/config/core";

export const chartConfig = defineConfig({
  preset: { default: "default", label: "Chart preset" },
  overrides: { default: "{}", label: "Chart overrides" },
});
