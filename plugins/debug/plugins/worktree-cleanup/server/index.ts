import type { ServerPluginDefinition } from "@server/types";
import { handleList } from "./internal/handle-list";
import { handleDelete } from "./internal/handle-delete";
import { handleBulkDelete } from "./internal/handle-bulk-delete";

export default {
  id: "debug-worktree-cleanup",
  name: "Worktree Cleanup",
  description: "Audit and remove stale git worktrees and their Postgres DB forks.",
  httpRoutes: {
    "GET /api/debug/worktrees": handleList,
    "POST /api/debug/worktrees/bulk-delete": handleBulkDelete,
    "DELETE /api/debug/worktrees/:id": handleDelete,
  },
} satisfies ServerPluginDefinition;
