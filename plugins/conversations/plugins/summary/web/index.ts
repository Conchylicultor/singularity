import type { PluginDefinition } from "@core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { SummarizeButton } from "./components/summarize-button";

export default {
  id: "conversation-summary",
  name: "Conversation: Summary",
  description:
    "Toolbar button that generates a structured Sonnet summary of the conversation (phase, flags, next action) and surfaces it as a chip with a detail popover.",
  contributions: [
    conversationPane.Actions({ component: SummarizeButton }),
  ],
} satisfies PluginDefinition;
