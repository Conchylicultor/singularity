import type { PluginDefinition } from "@core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web/slots";
import { CodeToolbarSlot } from "./components/toolbar-slot";

const codePlugin: PluginDefinition = {
  id: "conversation-code",
  name: "Conversation: Code",
  description:
    "Meta plugin hosting code-related contributions for a conversation (edited files, viewer, etc.).",
  contributions: [
    Conversation.Toolbar({
      component: CodeToolbarSlot,
    }),
  ],
};

export default codePlugin;
