import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { CodeToolbarSlot } from "./components/toolbar-slot";

export { Code } from "./slots";
export { useEditedFiles } from "./use-edited-files";

export default {
  id: "conversation-code",
  name: "Conversation: Code",
  description:
    "Meta plugin hosting code-related contributions for a conversation (edited files, viewer, etc.).",
  contributions: [Conversation.ActionBar({ id: "code-toolbar", component: CodeToolbarSlot })],
} satisfies PluginDefinition;
