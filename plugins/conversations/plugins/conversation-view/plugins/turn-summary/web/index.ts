import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { TurnSummaryCard } from "./components/turn-summary-card";

export default {
  id: "turn-summary",
  name: "Conversation View: Turn Summary",
  description:
    "Inline card above the prompt input showing a Haiku-generated summary of the latest assistant turn, with caveats and suggested actions.",
  contributions: [Conversation.AbovePromptInput({ component: TurnSummaryCard })],
} satisfies PluginDefinition;
