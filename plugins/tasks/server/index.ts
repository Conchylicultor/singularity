import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleList } from "./internal/handle-list";
import { handleCreate } from "./internal/handle-create";
import { handleGet } from "./internal/handle-get";
import { handleUpdate } from "./internal/handle-update";
import { handleDelete } from "./internal/handle-delete";
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

const plugin: ServerPluginDefinition = {
  id: "tasks",
  name: "Tasks",
  description: "Nested tasks with attempts linking to conversations.",
  httpRoutes: {
    "GET /api/tasks": handleList,
    "POST /api/tasks": handleCreate,
    "GET /api/tasks/:id": handleGet,
    "PATCH /api/tasks/:id": handleUpdate,
    "DELETE /api/tasks/:id": handleDelete,
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
};
export default plugin;
