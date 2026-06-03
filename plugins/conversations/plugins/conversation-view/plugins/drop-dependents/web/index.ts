import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { DropDependentsButton } from "./components/drop-dependents-button";

export default {
  name: "Conversation: Drop Dependents",
  description:
    "Prompt-bar button that drops the task and all its transitive dependents, then closes the conversation.",
  contributions: [Conversation.PromptBar({ id: "drop-dependents", component: DropDependentsButton, section: "Exit", sectionOrder: 2 })],
} satisfies PluginDefinition;
