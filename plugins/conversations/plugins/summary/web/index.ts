import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { convSummaryPane } from "./panes";
import { IdKinds } from "@plugins/ids/web";
import { summaryIdKind } from "../core";

export default {
  description:
    "Toolbar button that opens a side pane with the Summarise action and the latest structured Sonnet summary (phase, flags, next action).",
  contributions: [
    IdKinds.Kind({ kind: summaryIdKind }),
    Pane.Register({ pane: convSummaryPane }),
  ],
  slots: { "conv-summary": convSummaryPane },
} satisfies PluginDefinition;
