import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Stats } from "@plugins/stats/web";
import { PushesSection } from "./components/pushes-section";

export default {
  id: "stats-pushes",
  name: "Stats: Pushes",
  description:
    "Push contention stats: wait time, throughput, and step breakdown charts.",
  contributions: [
    Stats.Chart({
      id: "pushes",
      title: "Pushes",
      component: PushesSection,
    }),
  ],
} satisfies PluginDefinition;
