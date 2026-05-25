import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { ConfigV2 } from "@plugins/config_v2/web";
import { DynamicEnum } from "@plugins/config_v2/plugins/fields/plugins/dynamic-enum/web";
import { colorPaletteGroup } from "../shared";
import { colorPaletteConfig } from "./internal/config";
import { ColorPalette } from "./slots";
import { ColorPalettePicker } from "./components/color-palette-picker";
import { ColorPaletteHeaderDots } from "./components/color-palette-header-dots";
import { ColorPaletteSection } from "./components/color-palette-section";
import { builtInPresets } from "./presets";

export { ColorPalette } from "./slots";
export type { ColorPalettePresetContribution } from "./slots";

export default {
  id: "ui-tokens-color-palette",
  name: "UI: Color Palette",
  description: "Color palette token group with switchable presets.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: colorPaletteConfig }),
    DynamicEnum.Options({ field: colorPaletteConfig.fields.preset, useOptions: () => ColorPalette.Preset.useContributions().map((p) => ({ value: p.id, label: p.label })) }),
    ...builtInPresets.map((p) => ColorPalette.Preset(p)),
    ThemeEngine.TokenGroup({
      id: "color-palette",
      label: "Color Palette",
      descriptor: colorPaletteGroup,
      usePresets: () => ColorPalette.Preset.useContributions(),
      configDescriptor: colorPaletteConfig,
    }),
    ThemeEngine.VariantGroup({
      componentId: "color-palette",
      componentLabel: "Color Palette",
      component: ColorPalettePicker,
    }),
    ThemeCustomizer.Section({
      id: "color-palette",
      label: "Color Palette",
      component: ColorPaletteSection,
      headerExtra: ColorPaletteHeaderDots,
    }),
  ],
} satisfies PluginDefinition;
