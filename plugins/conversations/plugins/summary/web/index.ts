import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { convSummaryPane } from "./panes";

export default {
  description:
    "Toolbar button that opens a side pane with the Summarise action and the latest structured Sonnet summary (phase, flags, next action).",
  contributions: [
    Pane.Register({ pane: convSummaryPane }),
  ],
} satisfies PluginDefinition;
