import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { DynamicEnum } from "@plugins/fields/plugins/dynamic-enum/plugins/config/web";
import { ThemeEngine, useTokenGroupPresetOptions } from "@plugins/ui/plugins/theme-engine/web";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { typeScaleGroup } from "../shared";
import { typeScaleConfig } from "./internal/config";
import { TypeScale } from "./slots";
import { TypeScalePicker } from "./components/type-scale-picker";
import { TypeScaleSection } from "./components/type-scale-section";
import { builtInPresets } from "./presets";

export { TypeScale } from "./slots";
export type { TypeScalePresetContribution } from "./slots";

export default {
  description: "Type-scale token group (font sizes, line heights, weights) with switchable presets.",
  contributions: [
    ...builtInPresets.map((p) => TypeScale.Preset(p)),
    ConfigV2.WebRegister({ descriptor: typeScaleConfig }),
    DynamicEnum.Options({ field: typeScaleConfig.fields.preset, useOptions: () =>
      useTokenGroupPresetOptions("type-scale")
    }),
    ThemeEngine.TokenGroup({
      id: "type-scale",
      label: "Type Scale",
      descriptor: typeScaleGroup,
      usePresets: () => TypeScale.Preset.useContributions(),
      configDescriptor: typeScaleConfig,
    }),
    ThemeEngine.VariantGroup({
      id: "type-scale",
      componentLabel: "Type Scale",
      component: TypeScalePicker,
      selects: "tokens",
    }),
    ThemeCustomizer.Section({
      id: "type-scale",
      label: "Type Scale",
      component: TypeScaleSection,
    }),
  ],
} satisfies PluginDefinition;
