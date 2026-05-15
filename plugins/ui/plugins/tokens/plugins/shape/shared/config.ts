import { defineConfig } from "@plugins/config/core";

export const shapeConfig = defineConfig({
  preset: { default: "default", label: "Shape preset" },
  overrides: { default: "{}", label: "Shape overrides" },
});
