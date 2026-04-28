import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Code } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import { DocsButton } from "./components/docs-button";
import { convDocsPane } from "./panes";

export default {
  id: "conversation-code-docs-button",
  name: "Conversation: Code — Docs button",
  description:
    "Toolbar button that opens a sidebar listing edited markdown design docs in the conversation worktree.",
  contributions: [
    Pane.Register({ pane: convDocsPane }),
    Code.ToolbarButton({
      component: DocsButton,
    }),
  ],
} satisfies PluginDefinition;
