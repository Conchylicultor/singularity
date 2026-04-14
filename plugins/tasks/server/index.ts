import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleList } from "./internal/handle-list";
import { handleCreate } from "./internal/handle-create";
import { handleGet } from "./internal/handle-get";
import { handleUpdate } from "./internal/handle-update";
import { handleStream } from "./internal/sse";

const plugin: ServerPluginDefinition = {
  id: "tasks",
  name: "Tasks",
  description: "Nested tasks with attempts linking to conversations.",
  httpRoutes: {
    "GET /api/tasks": handleList,
    "GET /api/tasks/stream": handleStream,
    "POST /api/tasks": handleCreate,
    "GET /api/tasks/:id": handleGet,
    "PATCH /api/tasks/:id": handleUpdate,
  },
};
export default plugin;
