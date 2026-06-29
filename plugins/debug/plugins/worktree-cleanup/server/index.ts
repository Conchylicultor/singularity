import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { handleList } from "./internal/handle-list";
import { handleDelete } from "./internal/handle-delete";
import { handleBulkDelete } from "./internal/handle-bulk-delete";
import { worktreeReapJob } from "./internal/reap-job";
import { listWorktrees, bulkDeleteWorktrees, deleteWorktree } from "../shared/endpoints";

export default {
  description: "Audit and remove stale git worktrees and their Postgres DB forks.",
  httpRoutes: {
    [listWorktrees.route]: handleList,
    [bulkDeleteWorktrees.route]: handleBulkDelete,
    [deleteWorktree.route]: handleDelete,
  },
  register: [worktreeReapJob],
  // Drain the stale-registry backlog promptly after boot rather than waiting up
  // to an hour for the next scheduled tick. The reap job is main-only (DBs +
  // the registry are global cluster resources) and `dedup: "singleton"` keeps
  // this enqueue from piling up; steady-state runs find nothing to do.
  onReady: () => {
    if (!isMain()) return;
    void worktreeReapJob.enqueue({});
  },
} satisfies ServerPluginDefinition;
