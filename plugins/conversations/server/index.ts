import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleList } from "./internal/handle-list";
import { handleCreate } from "./internal/handle-create";
import { handleDelete } from "./internal/handle-delete";
import { handleGet } from "./internal/handle-get";
import { handleStream } from "./internal/sse";
import { startPoller } from "./internal/poller";

startPoller();

const plugin: ServerPluginDefinition = {
  id: "conversations",
  name: "Conversations",
  description: "Conversation domain: shared server code and types; view plugins live under `plugins/`.",
  httpRoutes: {
    "GET /api/conversations": handleList,
    "GET /api/conversations/stream": handleStream,
    "GET /api/conversations/:id": handleGet,
    "POST /api/conversations": handleCreate,
    "DELETE /api/conversations": handleDelete,
  },
};
export default plugin;
