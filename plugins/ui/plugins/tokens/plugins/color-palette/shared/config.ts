import { defineConfig } from "@plugins/config/core";

export const colorPaletteConfig = defineConfig({
  preset: { default: "default", label: "Color Palette preset" },
  overrides: { default: "{}", label: "Color Palette overrides" },
});
