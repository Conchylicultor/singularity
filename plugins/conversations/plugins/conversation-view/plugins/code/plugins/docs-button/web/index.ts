import type { PluginDefinition } from "@core";
import { Code } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import { DocsButton } from "./components/docs-button";

export default {
  id: "conversation-code-docs-button",
  name: "Conversation: Code — Docs button",
  description:
    "Toolbar button that opens a sidebar listing edited markdown design docs in the conversation worktree.",
  contributions: [
    Code.ToolbarButton({
      component: DocsButton,
    }),
  ],
} satisfies PluginDefinition;
