import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleList } from "./internal/handle-list";
import { handleCreate } from "./internal/handle-create";
import { handleGet } from "./internal/handle-get";
import { handleUpdate } from "./internal/handle-update";
import { handleDelete } from "./internal/handle-delete";
import {
  handleAddDependency,
  handleRemoveDependency,
} from "./internal/handle-dependencies";
import { handleRepoInfo } from "./internal/handle-repo-info";
import { startPushWatcher } from "./internal/push-watcher";
import {
  backfillConversationsMetaParent,
  ensureConversationsMetaTask,
} from "./internal/meta-conversations";
import "./internal/mcp-tools";

// Re-export public surface (Zod schemas, types, resources, helpers).
// pgTable objects are NOT re-exported — they live only in tasks-core/internal.
export {
  TaskSchema,
  TaskStatusSchema,
  AttemptSchema,
  AttemptStatusSchema,
  PushSchema,
  tasksResource,
  attemptsResource,
  pushesResource,
  CONVERSATIONS_META_TASK_ID,
  findNextRankUnder as nextRankUnder,
} from "@plugins/tasks-core/server";
export type {
  Task,
  TaskStatus,
  Attempt,
  AttemptStatus,
  Push,
} from "@plugins/tasks-core/server";

export default {
  id: "tasks",
  name: "Tasks",
  description: "Nested tasks with attempts linking to conversations.",
  httpRoutes: {
    "GET /api/tasks": handleList,
    "POST /api/tasks": handleCreate,
    "GET /api/tasks/:id": handleGet,
    "PATCH /api/tasks/:id": handleUpdate,
    "DELETE /api/tasks/:id": handleDelete,
    "POST /api/tasks/:id/dependencies": handleAddDependency,
    "DELETE /api/tasks/:id/dependencies/:depId": handleRemoveDependency,
    "GET /api/repo-info": handleRepoInfo,
  },
  // Resources are now mounted on tasks-core; tasks plugin owns no resources.
  resources: [],
  onReady: async () => {
    const created = await ensureConversationsMetaTask();
    if (created) {
      const n = await backfillConversationsMetaParent();
      console.log(
        `[tasks] created Conversations meta task; backfilled ${n} orphan root task(s)`,
      );
    }
    await startPushWatcher();
  },
} satisfies ServerPluginDefinition;
