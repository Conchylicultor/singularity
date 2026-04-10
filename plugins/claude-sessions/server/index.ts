import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleList } from "./internal/handle-list";
import { handleCreate } from "./internal/handle-create";
import { handleDelete } from "./internal/handle-delete";

const plugin: ServerPluginDefinition = {
  id: "claude-sessions",
  name: "Claude Sessions",
  httpRoutes: {
    "GET /api/claude-sessions": handleList,
    "POST /api/claude-sessions": handleCreate,
    "DELETE /api/claude-sessions": handleDelete,
  },
};
export default plugin;
