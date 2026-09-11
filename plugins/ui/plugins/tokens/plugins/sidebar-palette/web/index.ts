import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { tokenGroupMatchesSearch } from "@plugins/ui/plugins/theme-engine/core";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { sidebarPaletteGroup } from "../core";
import { SidebarPaletteHeaderDots } from "./components/sidebar-palette-header-dots";
import { SidebarPaletteSection } from "./components/sidebar-palette-section";

export default {
  description: "Sidebar palette token group with its customizer section.",
  contributions: [
    ThemeEngine.TokenGroup({
      id: "sidebar-palette",
      label: "Sidebar Palette",
      descriptor: sidebarPaletteGroup,
    }),
    ThemeCustomizer.Section({
      id: "sidebar-palette",
      label: "Sidebar Palette",
      component: SidebarPaletteSection,
      actions: SidebarPaletteHeaderDots,
      // No token in this group answers the search box ⇒ no card, rather
      // than a titled bar over a filtered-to-empty list.
      useAvailable: ({ search }) =>
        tokenGroupMatchesSearch(sidebarPaletteGroup, search),
    }),
  ],
} satisfies PluginDefinition;
