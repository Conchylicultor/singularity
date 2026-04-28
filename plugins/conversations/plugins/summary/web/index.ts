import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { SummarizeButton } from "./components/summarize-button";
import { convSummaryPane } from "./panes";

export default {
  id: "conversation-summary",
  name: "Conversation: Summary",
  description:
    "Toolbar button that opens a side pane with the Summarise action and the latest structured Sonnet summary (phase, flags, next action).",
  contributions: [
    Pane.Register({ pane: convSummaryPane }),
    conversationPane.Actions({ component: SummarizeButton }),
  ],
} satisfies PluginDefinition;
