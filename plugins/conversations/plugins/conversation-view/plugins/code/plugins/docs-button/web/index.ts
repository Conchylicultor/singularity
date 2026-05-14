import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { DocsButton } from "./components/docs-button";
import { convDocsPane } from "./panes";

export default {
  id: "conversation-code-docs-button",
  name: "Conversation: Code — Docs button",
  description:
    "Toolbar button that opens a sidebar listing edited markdown design docs in the conversation worktree.",
  contributions: [
    Pane.Register({ pane: convDocsPane }),
    Conversation.ActionBar({ id: "docs", component: DocsButton }),
  ],
} satisfies PluginDefinition;
