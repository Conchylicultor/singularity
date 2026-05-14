import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { BlockedByButton } from "./components/blocked-by-button";

export default {
  id: "conversation-blocked-by",
  name: "Conversation: Blocked By",
  description:
    "Prompt-bar button to mark this conversation's task as blocked by another conversation's task, creating a dependency and re-ordering the queue.",
  contributions: [
    Conversation.PromptBar({
      id: "blocked-by",
      component: BlockedByButton,
      section: "Deps",
      sectionOrder: 0,
    }),
  ],
} satisfies PluginDefinition;
