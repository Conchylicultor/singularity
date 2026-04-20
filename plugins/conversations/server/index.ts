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

export { _conversations } from "./internal/tables";
export { conversations, ConversationSchema } from "./internal/schema";
export type { Conversation } from "./internal/schema";
export { ConversationModelSchema } from "./model";
export type { ConversationModel } from "./model";
export { ConversationStatusSchema, isActiveStatus } from "./status";
export type { ConversationStatus } from "./status";
export { conversationsResource } from "./internal/resources";
export { createConversation, deleteConversation } from "./internal/lifecycle";
export type { Turn } from "./internal/claude-transcript";
export { Runtime, getConversationRow, readConversationTurns } from "./api";
export type { RuntimeInfo, ConversationRuntime } from "./api";

export default {
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
} satisfies ServerPluginDefinition;
