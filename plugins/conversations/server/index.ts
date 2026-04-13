import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleList } from "./internal/handle-list";
import { handleCreate } from "./internal/handle-create";
import { handleDelete } from "./internal/handle-delete";

const plugin: ServerPluginDefinition = {
  id: "conversations",
  name: "Conversations",
  description: "Conversation domain: shared server code and types; view plugins live under `plugins/`.",
  httpRoutes: {
    "GET /api/conversations": handleList,
    "POST /api/conversations": handleCreate,
    "DELETE /api/conversations": handleDelete,
  },
};
export default plugin;
