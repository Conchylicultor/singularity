import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Config } from "@plugins/config/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { turnSummaryConfig } from "../shared/config";
import { TurnSummaryCard } from "./components/turn-summary-card";

export default {
  id: "turn-summary",
  name: "Conversation View: Turn Summary",
  description:
    "Inline card above the prompt input showing a Haiku-generated summary of the latest assistant turn, with caveats and suggested actions.",
  contributions: [
    Conversation.AbovePromptInput({ id: "turn-summary", component: TurnSummaryCard }),
    Config.Spec(turnSummaryConfig),
  ],
} satisfies PluginDefinition;
