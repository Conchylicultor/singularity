import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { BranchButtons } from "./components/branch-buttons";

export default {
  id: "conversation-branch",
  name: "Conversation: Branch",
  description:
    "Forks the current Claude session into a background conversation with the typed draft as the opening prompt.",
  contributions: [
    Conversation.PromptBar({
      id: "branch",
      component: BranchButtons,
      section: "Branch",
      sectionOrder: 1,
    }),
  ],
} satisfies PluginDefinition;
