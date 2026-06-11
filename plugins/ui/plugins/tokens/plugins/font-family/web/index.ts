import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { DynamicEnum } from "@plugins/fields/plugins/dynamic-enum/plugins/config/web";
import { ThemeEngine, useTokenGroupPresets } from "@plugins/ui/plugins/theme-engine/web";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { fontFamilyGroup } from "../shared";
import { fontFamilyConfig } from "./internal/config";
import { FontFamily } from "./slots";
import { FontFamilyPicker } from "./components/font-family-picker";
import { FontFamilySection } from "./components/font-family-section";
import { builtInPresets } from "./presets";

export { FontFamily } from "./slots";
export type { FontFamilyPresetContribution } from "./slots";
export { fontFamilyConfig } from "./internal/config";

export default {
  description: "Font-family token group (sans/serif/mono families, letter-spacing) with switchable presets.",
  contributions: [
    ...builtInPresets.map((p) => FontFamily.Preset(p)),
    ConfigV2.WebRegister({ descriptor: fontFamilyConfig }),
    DynamicEnum.Options({ field: fontFamilyConfig.fields.preset, useOptions: () =>
      useTokenGroupPresets("font-family").map((p) => ({ value: p.id, label: p.label }))
    }),
    ThemeEngine.TokenGroup({
      id: "font-family",
      label: "Fonts",
      descriptor: fontFamilyGroup,
      usePresets: () => FontFamily.Preset.useContributions(),
      configDescriptor: fontFamilyConfig,
    }),
    ThemeEngine.VariantGroup({
      id: "font-family",
      componentLabel: "Fonts",
      component: FontFamilyPicker,
    }),
    ThemeCustomizer.Section({
      id: "font-family",
      label: "Fonts",
      component: FontFamilySection,
    }),
  ],
} satisfies PluginDefinition;
