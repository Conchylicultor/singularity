import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleClose } from "./internal/handle-close";
import { handleList } from "./internal/handle-list";
import { handleListGone } from "./internal/handle-list-gone";
import { handleCreate } from "./internal/handle-create";
import { handleDelete } from "./internal/handle-delete";
import { handleGet } from "./internal/handle-get";
import { handleListTurns } from "./internal/handle-list-turns";
import { handlePostTurn } from "./internal/handle-post-turn";
import { startPoller } from "./internal/poller";
import { forkErrorsResource } from "./internal/fork-errors";

export { ConversationModelSchema } from "./schema";
export type { ConversationModel } from "./schema";
export { ConversationStatusSchema, isActiveStatus } from "./status";
export type { ConversationStatus } from "./status";
export {
  ConversationSchema,
  recentConversationsResource,
} from "@plugins/tasks-core/server";
export type { Conversation } from "@plugins/tasks-core/server";
export { createConversation, deleteConversation, resumeConversation } from "./internal/lifecycle";
export type { Turn } from "./internal/claude-transcript";
export { findTranscriptPath } from "./internal/claude-transcript";
export { Runtime, getConversationRow, readConversationTurns, sendTurn } from "./internal/runtime";
export type { RuntimeInfo, ConversationRuntime } from "./internal/runtime";

export default {
  id: "conversations",
  name: "Conversations",
  description:
    "Conversation domain: shared server code and types; view plugins live under `plugins/`.",
  httpRoutes: {
    "GET /api/conversations": handleList,
    "GET /api/conversations/gone": handleListGone,
    "GET /api/conversations/:id": handleGet,
    "POST /api/conversations": handleCreate,
    "DELETE /api/conversations": handleDelete,
    "POST /api/conversations/:id/turn": handlePostTurn,
    "GET /api/conversations/:id/turns": handleListTurns,
    "POST /api/conversations/:id/close": handleClose,
  },
  // recentConversationsResource is now mounted on tasks-core; only fork-errors stays here.
  resources: [forkErrorsResource],
  onReady: () => startPoller(),
} satisfies ServerPluginDefinition;
