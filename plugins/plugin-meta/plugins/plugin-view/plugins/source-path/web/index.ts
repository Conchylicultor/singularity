import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { SourcePathSummary } from "./components/source-path-section";

export default {
  description: "Displays the plugin's source path in the plugin detail pane.",
  contributions: [
    // A path is one line: no `component`, so the card is that single row.
    PluginViewSlots.Section({
      id: "source-path",
      label: "Source Path",
      summary: SourcePathSummary,
    }),
  ],
} satisfies PluginDefinition;
