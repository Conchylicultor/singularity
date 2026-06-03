import { defineConfig } from "@plugins/config_v2/core";
import { intField, floatField } from "@plugins/config_v2/plugins/fields/plugins/primitives/core";
import { dynamicEnumField } from "@plugins/config_v2/plugins/fields/plugins/dynamic-enum/core";

export const colorAdjustConfig = defineConfig({
  scope: "app",
  fields: {
    preset: dynamicEnumField({ default: "default", label: "Color adjust preset" }),
    hueShift: intField({ default: 0, label: "Hue shift" }),
    saturationScale: floatField({ default: 1, label: "Saturation" }),
    lightnessScale: floatField({ default: 1, label: "Lightness" }),
  },
});
