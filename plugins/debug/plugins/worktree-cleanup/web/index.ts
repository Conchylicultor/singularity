import type { PluginDefinition } from "@core";
import { ShellCommands } from "@plugins/shell/web";
import { Debug } from "@plugins/debug/web";
import { MdFolderDelete } from "react-icons/md";
import { worktreeCleanupPane } from "./views";

export default {
  id: "debug-worktree-cleanup",
  name: "Worktree Cleanup",
  description: "Audit and remove stale git worktrees and their Postgres DB forks.",
  contributions: [
    Debug.Item({
      id: "worktree-cleanup",
      title: "Worktree Cleanup",
      icon: MdFolderDelete,
      onClick: () => ShellCommands.OpenPane(worktreeCleanupPane()),
    }),
  ],
} satisfies PluginDefinition;
