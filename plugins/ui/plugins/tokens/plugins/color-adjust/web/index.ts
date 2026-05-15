import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { useConfigValues } from "@plugins/config/web";
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
    ...builtInPresets.map((p) => ColorAdjust.Preset(p)),
    ThemeEngine.ColorTransform({
      useAdjustment: () => {
        const vals = useConfigValues(
          colorAdjustConfig,
          "ui-tokens-color-adjust",
        );
        return {
          hueShift: vals.hueShift as number,
          saturationScale: vals.saturationScale as number,
          lightnessScale: vals.lightnessScale as number,
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
