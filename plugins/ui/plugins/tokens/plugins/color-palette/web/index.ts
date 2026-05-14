import type { PluginDefinition } from "@core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { colorPaletteGroup } from "../shared";
import { colorPaletteConfig } from "./internal/config";
import { ColorPalette } from "./slots";
import { ColorPalettePicker } from "./components/color-palette-picker";
import { builtInPresets } from "./presets";

export { ColorPalette } from "./slots";
export type { ColorPalettePresetContribution } from "./slots";

export default {
  id: "ui-tokens-color-palette",
  name: "UI: Color Palette",
  description: "Color palette token group with switchable presets.",
  contributions: [
    ...builtInPresets.map((p) => ColorPalette.Preset(p)),
    ThemeEngine.TokenGroup({
      id: "color-palette",
      label: "Color Palette",
      descriptor: colorPaletteGroup,
      usePresets: () => ColorPalette.Preset.useContributions(),
      configDescriptor: colorPaletteConfig,
      pluginId: "ui-tokens-color-palette",
    }),
    ThemeEngine.VariantGroup({
      componentId: "color-palette",
      componentLabel: "Color Palette",
      component: ColorPalettePicker,
    }),
  ],
} satisfies PluginDefinition;
