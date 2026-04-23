import type { PluginDefinition } from "@core";
import { MdFolderOpen } from "react-icons/md";
import { Shell } from "@plugins/shell/web";
import { Code } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import { ConvTreeButton } from "./components/conv-tree-button";
// Importing the panes module registers globalFileTreePane and convFileTreePane
// with the PaneRouter as a side effect of Pane.define calls at module load.
import { globalFileTreePane } from "./panes";

export default {
  id: "code-explorer",
  name: "Code Explorer",
  description:
    "Worktree-scoped file browser: sidebar entry opens the main worktree; conversation toolbar opens the agent's worktree.",
  contributions: [
    Shell.Sidebar({
      title: "Explorer",
      icon: MdFolderOpen,
      group: "System",
      onClick: () => globalFileTreePane.open({ worktree: "main" }),
    }),
    Code.ToolbarButton({ component: ConvTreeButton }),
  ],
} satisfies PluginDefinition;
