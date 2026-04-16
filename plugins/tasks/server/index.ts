import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleList } from "./internal/handle-list";
import { handleCreate } from "./internal/handle-create";
import { handleGet } from "./internal/handle-get";
import { handleUpdate } from "./internal/handle-update";
import { handleDelete } from "./internal/handle-delete";
import {
  attemptsResource,
  pushesResource,
  tasksResource,
} from "./internal/resources";
import { startPushWatcher } from "./internal/push-watcher";

// Same deferral rationale as the conversations poller: keep background work
// out of module init so runMigrations() completes before the first query.
queueMicrotask(() => startPushWatcher());

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
  },
  resources: [tasksResource, attemptsResource, pushesResource],
};
export default plugin;
