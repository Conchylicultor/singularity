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
import {
  attemptsResource,
  pushesResource,
  tasksResource,
} from "./internal/resources";
import { startPushWatcher } from "./internal/push-watcher";
import {
  backfillConversationsMetaParent,
  ensureConversationsMetaTask,
} from "./internal/meta-conversations";
import "./internal/mcp-tools";

export { _attempts, _tasks, pushes } from "./internal/tables";
export {
  attempts,
  tasks,
  AttemptSchema,
  AttemptStatusSchema,
  PushSchema,
  TaskSchema,
  TaskStatusSchema,
} from "./internal/schema";
export type { Attempt, AttemptStatus, Push, Task, TaskStatus } from "./internal/schema";
export { attemptsResource, pushesResource, tasksResource } from "./internal/resources";
export { CONVERSATIONS_META_TASK_ID } from "./internal/meta-conversations";
export { nextRankUnder } from "./internal/rank";

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
  resources: [tasksResource, attemptsResource, pushesResource],
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
