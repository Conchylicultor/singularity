import type { PluginDefinition } from "@core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { CodeToolbarSlot } from "./components/toolbar-slot";

export { Code } from "./slots";
export { useEditedFiles } from "./use-edited-files";

export default {
  id: "conversation-code",
  name: "Conversation: Code",
  description:
    "Meta plugin hosting code-related contributions for a conversation (edited files, viewer, etc.).",
  contributions: [conversationPane.Actions({ component: CodeToolbarSlot })],
} satisfies PluginDefinition;
