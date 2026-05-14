import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { BlockingButton } from "./components/blocking-button";

export default {
  id: "conversation-blocking",
  name: "Conversation: Blocking",
  description:
    "Prompt-bar button to mark this conversation's task as blocking another conversation's task, creating a dependency and re-ordering the queue.",
  contributions: [
    Conversation.PromptBar({
      id: "blocking",
      component: BlockingButton,
      section: "Deps",
      sectionOrder: 1,
    }),
  ],
} satisfies PluginDefinition;
