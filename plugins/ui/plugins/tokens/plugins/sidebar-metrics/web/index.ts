import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { tokenGroupMatchesSearch } from "@plugins/ui/plugins/theme-engine/core";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { sidebarMetricsGroup } from "../core";
import { SidebarMetricsSection } from "./components/sidebar-metrics-section";

export default {
  description:
    "Sidebar metrics token group (panel width, nav row height, padding, icon size, icon gap, label weight) with its customizer section.",
  contributions: [
    ThemeEngine.TokenGroup({
      id: "sidebar-metrics",
      label: "Sidebar Metrics",
      descriptor: sidebarMetricsGroup,
    }),
    ThemeCustomizer.Section({
      id: "sidebar-metrics",
      label: "Sidebar Metrics",
      component: SidebarMetricsSection,
      // No token in this group answers the search box ⇒ no card, rather
      // than a titled bar over a filtered-to-empty list.
      useAvailable: ({ search }) =>
        tokenGroupMatchesSearch(sidebarMetricsGroup, search),
    }),
  ],
} satisfies PluginDefinition;
