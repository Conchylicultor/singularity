import type { PluginDefinition } from "@core";
import { MdFolderOpen } from "react-icons/md";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Shell } from "@plugins/shell/web";
import { Code } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
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
      title: "Explorer",
      icon: MdFolderOpen,
      group: "System",
      onClick: () => globalFileTreePane.open({ worktree: "main" }),
    }),
    Code.ToolbarButton({ component: ConvTreeButton }),
  ],
} satisfies PluginDefinition;
