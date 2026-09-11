import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { tokenGroupMatchesSearch } from "@plugins/ui/plugins/theme-engine/core";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { typeScaleGroup } from "../core";
import { TypeScaleSection } from "./components/type-scale-section";

export default {
  description:
    "Type-scale token group (font sizes, line heights, weights) with its customizer section.",
  contributions: [
    ThemeEngine.TokenGroup({
      id: "type-scale",
      label: "Type Scale",
      descriptor: typeScaleGroup,
    }),
    ThemeCustomizer.Section({
      id: "type-scale",
      label: "Type Scale",
      component: TypeScaleSection,
      // No token in this group answers the search box ⇒ no card, rather
      // than a titled bar over a filtered-to-empty list.
      useAvailable: ({ search }) =>
        tokenGroupMatchesSearch(typeScaleGroup, search),
    }),
  ],
} satisfies PluginDefinition;
