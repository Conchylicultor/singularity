import type { PluginDefinition } from "@core";
import { MdFolderOpen } from "react-icons/md";
import { Shell } from "@plugins/shell/web";
import { Code } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import { ConvTreeButton } from "./components/conv-tree-button";
import { globalFileTreePane, convFileTreePane } from "./panes";

// Import for side effects: registers the panes with the PaneRouter.
void globalFileTreePane;
void convFileTreePane;

const MAIN_WORKTREE = "main";

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
      onClick: () => globalFileTreePane.open({ worktree: MAIN_WORKTREE }),
    }),
    Code.ToolbarButton({ component: ConvTreeButton }),
  ],
} satisfies PluginDefinition;
