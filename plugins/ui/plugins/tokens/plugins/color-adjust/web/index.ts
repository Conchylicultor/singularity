import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { useConfig, ConfigV2 } from "@plugins/config_v2/web";
import { DynamicEnum } from "@plugins/config_v2/plugins/fields/plugins/dynamic-enum/web";
import { colorAdjustConfig } from "./internal/config";
import { ColorAdjust } from "./slots";
import { ColorAdjustPicker } from "./components/color-adjust-picker";
import { ColorAdjustSection } from "./components/color-adjust-section";
import { builtInPresets } from "./presets";

export { ColorAdjust } from "./slots";
export type { ColorAdjustPresetContribution } from "./slots";

export default {
  id: "ui-tokens-color-adjust",
  name: "UI: Color Adjust",
  description:
    "Cross-cutting color adjustment transform for all color token groups.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: colorAdjustConfig }),
    DynamicEnum.Options({ field: colorAdjustConfig.fields.preset, useOptions: () => ColorAdjust.Preset.useContributions().map((p) => ({ value: p.id, label: p.label })) }),
    ...builtInPresets.map((p) => ColorAdjust.Preset(p)),
    ThemeEngine.ColorTransform({
      useAdjustment: () => {
        const vals = useConfig(colorAdjustConfig);
        return {
          hueShift: vals.hueShift,
          saturationScale: vals.saturationScale,
          lightnessScale: vals.lightnessScale,
        };
      },
    }),
    ThemeEngine.VariantGroup({
      componentId: "color-adjust",
      componentLabel: "Color Adjust",
      component: ColorAdjustPicker,
    }),
    ThemeCustomizer.Section({
      id: "color-adjust",
      label: "Color Adjust",
      component: ColorAdjustSection,
    }),
  ],
} satisfies PluginDefinition;
