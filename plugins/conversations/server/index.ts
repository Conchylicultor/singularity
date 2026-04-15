import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleList } from "./internal/handle-list";
import { handleCreate } from "./internal/handle-create";
import { handleDelete } from "./internal/handle-delete";
import { handleGet } from "./internal/handle-get";
import { startPoller } from "./internal/poller";
import { conversationsResource } from "./internal/resources";
import { startPushWatcher } from "./internal/push-watcher";

startPoller();
startPushWatcher();

const plugin: ServerPluginDefinition = {
  id: "conversations",
  name: "Conversations",
  description: "Conversation domain: shared server code and types; view plugins live under `plugins/`.",
  httpRoutes: {
    "GET /api/conversations": handleList,
    "GET /api/conversations/:id": handleGet,
    "POST /api/conversations": handleCreate,
    "DELETE /api/conversations": handleDelete,
  },
  resources: [conversationsResource],
};
export default plugin;
