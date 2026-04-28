import type { PluginDefinition } from "@core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { SummarizeButton } from "./components/summarize-button";

// Importing panes registers `convSummaryPane` with the Pane registry.
import "./panes";

export default {
  id: "conversation-summary",
  name: "Conversation: Summary",
  description:
    "Toolbar button that opens a side pane with the Summarise action and the latest structured Sonnet summary (phase, flags, next action).",
  contributions: [
    conversationPane.Actions({ component: SummarizeButton }),
  ],
} satisfies PluginDefinition;
