import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { tokenGroupMatchesSearch } from "@plugins/ui/plugins/theme-engine/core";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { scrollbarGroup } from "../core";
import { ScrollbarSection } from "./components/scrollbar-section";

export default {
  description:
    "Scrollbar token group (native or custom, size, thumb inset and radius, thumb, hover and track colours) with its customizer section.",
  contributions: [
    ThemeEngine.TokenGroup({
      id: "scrollbar",
      label: "Scrollbar",
      descriptor: scrollbarGroup,
    }),
    ThemeCustomizer.Section({
      id: "scrollbar",
      label: "Scrollbar",
      component: ScrollbarSection,
      // No token in this group answers the search box ⇒ no card, rather
      // than a titled bar over a filtered-to-empty list.
      useAvailable: ({ search }) =>
        tokenGroupMatchesSearch(scrollbarGroup, search),
    }),
  ],
} satisfies PluginDefinition;
