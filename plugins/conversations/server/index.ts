import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleClose } from "./internal/handle-close";
import { handleList } from "./internal/handle-list";
import { handleCreate } from "./internal/handle-create";
import { handleDelete } from "./internal/handle-delete";
import { handleGet } from "./internal/handle-get";
import { handleListTurns } from "./internal/handle-list-turns";
import { handlePostTurn } from "./internal/handle-post-turn";
import { startPoller } from "./internal/poller";
import { conversationsResource } from "./internal/resources";
import { forkErrorsResource } from "./internal/fork-errors";

const plugin: ServerPluginDefinition = {
  id: "conversations",
  name: "Conversations",
  description:
    "Conversation domain: shared server code and types; view plugins live under `plugins/`.",
  httpRoutes: {
    "GET /api/conversations": handleList,
    "GET /api/conversations/:id": handleGet,
    "POST /api/conversations": handleCreate,
    "DELETE /api/conversations": handleDelete,
    "POST /api/conversations/:id/turn": handlePostTurn,
    "GET /api/conversations/:id/turns": handleListTurns,
    "POST /api/conversations/:id/close": handleClose,
  },
  resources: [conversationsResource, forkErrorsResource],
  onReady: () => startPoller(),
};
export default plugin;
