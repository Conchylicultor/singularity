import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { RuntimesSummary } from "./components/runtimes-section";

export default {
  description: "Displays runtime pills (web/server/central) in the plugin detail pane.",
  contributions: [
    // Two or three pills are one line: no `component`, so the card is that row.
    PluginViewSlots.Section({
      id: "runtimes",
      label: "Runtimes",
      summary: RuntimesSummary,
    }),
  ],
} satisfies PluginDefinition;
