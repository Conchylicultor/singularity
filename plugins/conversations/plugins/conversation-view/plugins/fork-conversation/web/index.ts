import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { ForkConversationButtons } from "./components/fork-conversation-buttons";

export default {
  id: "conversation-fork",
  name: "Conversation: Fork",
  description:
    "Toolbar buttons (+Sonnet / +Opus) that spin up a new conversation in the same worktree.",
  contributions: [Conversation.PromptBar({ id: "fork-conversation", component: ForkConversationButtons, section: "New", sectionOrder: 1 })],
} satisfies PluginDefinition;
