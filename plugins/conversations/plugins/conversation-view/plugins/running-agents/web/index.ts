import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { RunningAgentsBand } from "./components/running-agents-band";

export default {
  description:
    "The sub-agents working for this conversation, in a card above the prompt box: a summary line (how many are working, how long the longest has been going) that folds the list, and one row per agent — what it was asked to do, what it is, and what it last did. A finished agent lingers a few seconds showing 'done m:ss'; the card is not there at all when nothing is running.",
  contributions: [
    Conversation.AbovePromptInput({
      id: "running-agents",
      component: RunningAgentsBand,
    }),
  ],
} satisfies PluginDefinition;
