import type { ServerPluginDefinition } from "../../../../../server/src/types";
import { handleList } from "./internal/handle-list";
import { handleDelete } from "./internal/handle-delete";

export default {
  id: "debug-worktree-cleanup",
  name: "Worktree Cleanup",
  description: "Audit and remove stale git worktrees and their Postgres DB forks.",
  httpRoutes: {
    "GET /api/debug/worktrees": handleList,
    "DELETE /api/debug/worktrees/:id": handleDelete,
  },
} satisfies ServerPluginDefinition;
