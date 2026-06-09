import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Profiling } from "@plugins/debug/plugins/profiling/web";
import { StatsSection } from "./components/stats-section";

export default {
  description: "Stats endpoint profiling for the Gantt debug pane.",
  contributions: [
    Profiling.Section({
      id: "stats",
      order: 2,
      component: StatsSection,
    }),
  ],
} satisfies PluginDefinition;
