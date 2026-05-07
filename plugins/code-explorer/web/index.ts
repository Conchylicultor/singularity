import type { PluginDefinition } from "@core";
import { MdFolderOpen } from "react-icons/md";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Shell } from "@plugins/shell/web";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { ConvTreeButton } from "./components/conv-tree-button";
import { globalFileTreePane, convFileTreePane } from "./panes";
import { useImageProxyComponents } from "./internal/md-extension";

export { WorktreeContext, useWorktreeContext } from "./internal/worktree-context";

export default {
  id: "code-explorer",
  name: "Code Explorer",
  description:
    "Worktree-scoped file browser: sidebar entry opens the main worktree; conversation toolbar opens the agent's worktree.",
  contributions: [
    Pane.Register({ pane: globalFileTreePane }),
    Pane.Register({ pane: convFileTreePane }),
    Shell.Sidebar({
      id: "code-explorer",
      title: "Explorer",
      icon: MdFolderOpen,
      group: "System",
      onClick: () => globalFileTreePane.open({ worktree: "main" }),
    }),
    Conversation.ActionBar({ id: "explorer", component: ConvTreeButton }),
    Markdown.Extension({
      id: "image-proxy",
      priority: 50,
      useComponents: useImageProxyComponents,
    }),
  ],
} satisfies PluginDefinition;
