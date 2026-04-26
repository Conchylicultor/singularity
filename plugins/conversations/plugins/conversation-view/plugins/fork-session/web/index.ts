import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { ForkSessionButtons } from "./components/fork-session-buttons";

export default {
  id: "conversation-fork-session",
  name: "Conversation: Fork session",
  description:
    "Toolbar buttons (+Sonnet / +Opus) that fork the current conversation via `claude --resume <id> --fork-session`.",
  contributions: [
    Conversation.PromptBar({
      component: ForkSessionButtons,
      section: "Fork",
      sectionOrder: 2,
    }),
  ],
} satisfies PluginDefinition;
