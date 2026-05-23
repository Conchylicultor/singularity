import { defineConfig } from "@plugins/config_v2/core";
import { textField, intField, floatField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";

export const colorAdjustConfig = defineConfig({
  fields: {
    preset: textField({ default: "default", label: "Color adjust preset" }),
    hueShift: intField({ default: 0, label: "Hue shift" }),
    saturationScale: floatField({ default: 1, label: "Saturation" }),
    lightnessScale: floatField({ default: 1, label: "Lightness" }),
  },
});
