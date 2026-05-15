import { defineConfig } from "@plugins/config/core";

export const colorAdjustConfig = defineConfig({
  preset: { default: "default", label: "Color adjust preset" },
  hueShift: { default: 0, label: "Hue shift" },
  saturationScale: { default: 1, label: "Saturation" },
  lightnessScale: { default: 1, label: "Lightness" },
});
