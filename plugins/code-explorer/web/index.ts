import type { PluginDefinition } from "@core";
import { MdFolderOpen } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Shell } from "@plugins/shell/web";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { ConvTreeButton } from "./components/conv-tree-button";
import { globalFileTreePane, convFileTreePane } from "./panes";

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
      ...sidebarNavItem({ title: "Explorer", icon: MdFolderOpen, onClick: () => openPane(globalFileTreePane, { worktree: "main" }, { root: true }) }),
    }),
    Conversation.ActionBar({ id: "explorer", component: ConvTreeButton }),
  ],
} satisfies PluginDefinition;
