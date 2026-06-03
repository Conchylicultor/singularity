import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { DynamicEnum } from "@plugins/config_v2/plugins/fields/plugins/dynamic-enum/web";
import { ThemeEngine, useTokenGroupPresets } from "@plugins/ui/plugins/theme-engine/web";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { typographyGroup } from "../shared";
import { typographyConfig } from "./internal/config";
import { Typography } from "./slots";
import { TypographyPicker } from "./components/typography-picker";
import { TypographySection } from "./components/typography-section";
import { builtInPresets } from "./presets";

export { Typography } from "./slots";
export type { TypographyPresetContribution } from "./slots";
export { typographyConfig } from "./internal/config";

export default {
  name: "UI: Typography",
  description: "Typography token group (fonts, letter-spacing) with switchable presets.",
  contributions: [
    ...builtInPresets.map((p) => Typography.Preset(p)),
    ConfigV2.WebRegister({ descriptor: typographyConfig }),
    DynamicEnum.Options({ field: typographyConfig.fields.preset, useOptions: () =>
      useTokenGroupPresets("typography").map((p) => ({ value: p.id, label: p.label }))
    }),
    ThemeEngine.TokenGroup({
      id: "typography",
      label: "Typography",
      descriptor: typographyGroup,
      usePresets: () => Typography.Preset.useContributions(),
      configDescriptor: typographyConfig,
    }),
    ThemeEngine.VariantGroup({
      id: "typography",
      componentLabel: "Typography",
      component: TypographyPicker,
    }),
    ThemeCustomizer.Section({
      id: "typography",
      label: "Typography",
      component: TypographySection,
    }),
  ],
} satisfies PluginDefinition;
