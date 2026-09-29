import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Shell } from "@plugins/shell/web";
import { opensPane } from "@plugins/primitives/plugins/app-shell/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { ConvTreeButton } from "./components/conv-tree-button";
import { globalFileTreePane, convFileTreePane } from "./panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { FileTree } from "./components/file-tree";

export default {
  description:
    "Worktree-scoped file browser: sidebar entry opens the main worktree; conversation toolbar opens the agent's worktree.",
  contributions: [
    Pane.Register({ pane: globalFileTreePane }),
    Pane.Register({ pane: convFileTreePane }),
    Shell.Sidebar({
      id: "code-explorer",
      title: "Explorer",
      icon: symbol("folder"),
      opens: opensPane(globalFileTreePane, { worktree: "main" }),
    }),
    Conversation.ActionBar({ id: "explorer", component: ConvTreeButton }),
  ],
  slots: {
    "global-file-tree": globalFileTreePane,
    "conv-file-tree": convFileTreePane,
  },
} satisfies PluginDefinition;
