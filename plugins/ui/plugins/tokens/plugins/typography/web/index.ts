import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { typographyGroup } from "../shared";
import { typographyConfig } from "./internal/config";
import { Typography } from "./slots";
import { TypographyPicker } from "./components/typography-picker";
import { builtInPresets } from "./presets";

export { Typography } from "./slots";
export type { TypographyPresetContribution } from "./slots";

export default {
  id: "ui-tokens-typography",
  name: "UI: Typography",
  description: "Typography token group (fonts, letter-spacing) with switchable presets.",
  contributions: [
    ...builtInPresets.map((p) => Typography.Preset(p)),
    ThemeEngine.TokenGroup({
      id: "typography",
      label: "Typography",
      descriptor: typographyGroup,
      usePresets: () => Typography.Preset.useContributions(),
      configDescriptor: typographyConfig,
      pluginId: "ui-tokens-typography",
    }),
    ThemeEngine.VariantGroup({
      componentId: "typography",
      componentLabel: "Typography",
      component: TypographyPicker,
    }),
  ],
} satisfies PluginDefinition;
