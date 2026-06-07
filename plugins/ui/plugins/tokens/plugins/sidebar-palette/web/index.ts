import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { DynamicEnum } from "@plugins/fields/plugins/dynamic-enum/plugins/config/web";
import { ThemeEngine, useTokenGroupPresets } from "@plugins/ui/plugins/theme-engine/web";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { sidebarPaletteGroup } from "../shared";
import { sidebarPaletteConfig } from "./internal/config";
import { SidebarPalette } from "./slots";
import { SidebarPalettePicker } from "./components/sidebar-palette-picker";
import { SidebarPaletteHeaderDots } from "./components/sidebar-palette-header-dots";
import { SidebarPaletteSection } from "./components/sidebar-palette-section";
import { builtInPresets } from "./presets";

export { SidebarPalette } from "./slots";
export type { SidebarPalettePresetContribution } from "./slots";

export default {
  name: "UI: Sidebar Palette",
  description: "Sidebar palette token group with switchable presets.",
  contributions: [
    ...builtInPresets.map((p) => SidebarPalette.Preset(p)),
    ConfigV2.WebRegister({ descriptor: sidebarPaletteConfig }),
    DynamicEnum.Options({ field: sidebarPaletteConfig.fields.preset, useOptions: () =>
      useTokenGroupPresets("sidebar-palette").map((p) => ({ value: p.id, label: p.label }))
    }),
    ThemeEngine.TokenGroup({
      id: "sidebar-palette",
      label: "Sidebar Palette",
      descriptor: sidebarPaletteGroup,
      usePresets: () => SidebarPalette.Preset.useContributions(),
      configDescriptor: sidebarPaletteConfig,
    }),
    ThemeEngine.VariantGroup({
      id: "sidebar-palette",
      componentLabel: "Sidebar Palette",
      component: SidebarPalettePicker,
    }),
    ThemeCustomizer.Section({
      id: "sidebar-palette",
      label: "Sidebar Palette",
      component: SidebarPaletteSection,
      headerExtra: SidebarPaletteHeaderDots,
    }),
  ],
} satisfies PluginDefinition;
