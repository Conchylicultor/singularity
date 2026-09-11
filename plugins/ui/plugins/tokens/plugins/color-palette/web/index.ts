import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { tokenGroupMatchesSearch } from "@plugins/ui/plugins/theme-engine/core";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { colorPaletteGroup } from "../core";
import { ColorPaletteHeaderDots } from "./components/color-palette-header-dots";
import { ColorPaletteSection } from "./components/color-palette-section";

export default {
  description:
    "Color palette token group (surfaces, text, accents, status colors) with its customizer section.",
  contributions: [
    ThemeEngine.TokenGroup({
      id: "color-palette",
      label: "Color Palette",
      descriptor: colorPaletteGroup,
    }),
    ThemeCustomizer.Section({
      id: "color-palette",
      label: "Color Palette",
      component: ColorPaletteSection,
      actions: ColorPaletteHeaderDots,
      // No token in this group answers the search box ⇒ no card, rather
      // than a titled bar over a filtered-to-empty list.
      useAvailable: ({ search }) =>
        tokenGroupMatchesSearch(colorPaletteGroup, search),
    }),
  ],
} satisfies PluginDefinition;
