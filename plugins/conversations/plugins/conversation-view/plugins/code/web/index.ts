import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { CodeToolbarSlot } from "./components/toolbar-slot";

export { Code } from "./slots";

export default {
  id: "conversation-code",
  name: "Conversation: Code",
  description:
    "Meta plugin hosting code-related contributions for a conversation (edited files, viewer, etc.).",
  contributions: [
    Conversation.Toolbar({
      component: CodeToolbarSlot,
    }),
  ],
} satisfies PluginDefinition;
