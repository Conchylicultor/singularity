import type { PluginDefinition } from "@core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { sidebarPaletteGroup } from "../internal";
import { sidebarPaletteConfig } from "./internal/config";
import { SidebarPalette } from "./slots";
import { SidebarPalettePicker } from "./components/sidebar-palette-picker";
import { builtInPresets } from "./presets";

export { SidebarPalette } from "./slots";
export type { SidebarPalettePresetContribution } from "./slots";

export default {
  id: "ui-tokens-sidebar-palette",
  name: "UI: Sidebar Palette",
  description: "Sidebar palette token group with switchable presets.",
  contributions: [
    ...builtInPresets.map((p) => SidebarPalette.Preset(p)),
    ThemeEngine.TokenGroup({
      id: "sidebar-palette",
      label: "Sidebar Palette",
      descriptor: sidebarPaletteGroup,
      usePresets: () => SidebarPalette.Preset.useContributions(),
      configDescriptor: sidebarPaletteConfig,
      pluginId: "ui-tokens-sidebar-palette",
    }),
    ThemeEngine.VariantGroup({
      componentId: "sidebar-palette",
      componentLabel: "Sidebar Palette",
      component: SidebarPalettePicker,
    }),
  ],
} satisfies PluginDefinition;
