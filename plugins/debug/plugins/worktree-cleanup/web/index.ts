import type { PluginDefinition } from "@core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Debug } from "@plugins/debug/web";
import { MdFolderDelete } from "react-icons/md";
import { worktreeCleanupPane } from "./panes";

export { worktreeCleanupPane } from "./panes";

export default {
  id: "debug-worktree-cleanup",
  name: "Worktree Cleanup",
  description: "Audit and remove stale git worktrees and their Postgres DB forks.",
  contributions: [
    Pane.Register({ pane: worktreeCleanupPane }),
    Debug.Item({
      id: "worktree-cleanup",
      title: "Worktree Cleanup",
      icon: MdFolderDelete,
      onClick: () => worktreeCleanupPane.open({}),
    }),
  ],
} satisfies PluginDefinition;
