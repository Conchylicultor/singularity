import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Stats } from "@plugins/stats/web";
import { ResponsivenessSection } from "./components/responsiveness-section";

export default {
  description:
    "Responsiveness card: p50 / p95 of page loads, navigations and update delays for the last hour, day or week, calm beside under-pressure, with the exit criteria as pass / fail and the serving thread's time by plugin.",
  contributions: [
    Stats.Chart({
      id: "responsiveness",
      title: "Responsiveness",
      component: ResponsivenessSection,
    }),
  ],
} satisfies PluginDefinition;
