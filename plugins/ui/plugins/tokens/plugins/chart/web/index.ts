import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ThemeEngine } from "@plugins/ui/plugins/theme-engine/web";
import { tokenGroupMatchesSearch } from "@plugins/ui/plugins/theme-engine/core";
import { ThemeCustomizer } from "@plugins/ui/plugins/theme-engine/plugins/theme-customizer/web";
import { chartGroup } from "../core";
import { ChartSection } from "./components/chart-section";

export default {
  description:
    "Chart color token group: the chart-1…5 ramp and its customizer section.",
  contributions: [
    ThemeEngine.TokenGroup({
      id: "chart",
      label: "Chart",
      descriptor: chartGroup,
    }),
    ThemeCustomizer.Section({
      id: "chart",
      label: "Chart",
      component: ChartSection,
      // No token in this group answers the search box ⇒ no card. The body
      // does not filter itself, so without this the section stayed put
      // (full) under a query that matched nothing in it.
      useAvailable: ({ search }) => tokenGroupMatchesSearch(chartGroup, search),
    }),
  ],
} satisfies PluginDefinition;
