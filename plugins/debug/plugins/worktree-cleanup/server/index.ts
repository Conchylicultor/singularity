import type { ServerPluginDefinition } from "@server/types";
import { handleList } from "./internal/handle-list";
import { handleDelete } from "./internal/handle-delete";
import { handleBulkDelete } from "./internal/handle-bulk-delete";
import { listWorktrees, bulkDeleteWorktrees, deleteWorktree } from "../shared/endpoints";

export default {
  id: "debug-worktree-cleanup",
  name: "Worktree Cleanup",
  description: "Audit and remove stale git worktrees and their Postgres DB forks.",
  httpRoutes: {
    [listWorktrees.route]: handleList,
    [bulkDeleteWorktrees.route]: handleBulkDelete,
    [deleteWorktree.route]: handleDelete,
  },
} satisfies ServerPluginDefinition;
