import { defineConfig } from "@plugins/config_v2/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { floatField } from "@plugins/fields/plugins/float/plugins/config/core";
import { dynamicEnumField } from "@plugins/fields/plugins/dynamic-enum/plugins/config/core";

export const colorAdjustConfig = defineConfig({
  scope: "app",
  fields: {
    preset: dynamicEnumField({ default: "default", label: "Color adjust preset" }),
    hueShift: intField({ default: 0, label: "Hue shift" }),
    saturationScale: floatField({ default: 1, label: "Saturation" }),
    lightnessScale: floatField({ default: 1, label: "Lightness" }),
  },
});
