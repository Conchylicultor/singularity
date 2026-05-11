import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { handleClose } from "./internal/handle-close";
import { handleList } from "./internal/handle-list";
import { handleListGone } from "./internal/handle-list-gone";
import { handleCreate } from "./internal/handle-create";
import { handleDelete } from "./internal/handle-delete";
import { handleGet } from "./internal/handle-get";
import { handleListTurns } from "./internal/handle-list-turns";
import { handlePostTurn } from "./internal/handle-post-turn";
import { handleStop } from "./internal/handle-stop";
import { startPoller } from "./internal/poller";
import { startTurnEmitter } from "./internal/turn-emitter";
import { forkErrorsResource } from "./internal/fork-errors";
import { ensureSystemMeta } from "./internal/meta-system";
import {
  maybeLaunchTaskJob,
  maybeLaunchDependentsJob,
} from "./internal/auto-start-jobs";
import { conversationCreated } from "./internal/tables-created-event";
import { conversationTurnCompleted } from "./internal/tables-turn-completed-event";
import { userTurnSent } from "./internal/tables-user-turn-sent-event";
import { taskStatusChanged } from "@plugins/tasks-core/server";
import {
  deleteTriggersFor,
  trigger,
} from "@plugins/infra/plugins/events/server";

export { maybeLaunchTaskJob } from "./internal/auto-start-jobs";

export { ConversationStatusSchema, isActiveStatus, hasLiveProcess } from "./status";
export type { ConversationStatus } from "./status";
export { createConversation, deleteConversation, resumeConversation } from "./internal/lifecycle";
export type { Turn } from "./internal/claude-transcript";
export {
  Runtime,
  getConversationRow,
  interruptConversation,
  readConversationTurns,
  sendTurn,
} from "./internal/runtime";
export type { RuntimeInfo, ConversationRuntime } from "./internal/runtime";
export { conversationTurnCompleted } from "./internal/tables-turn-completed-event";
export type { ConversationTurnCompletedPayload } from "./internal/tables-turn-completed-event";
export { afterTurn } from "./internal/after-turn";
export { conversationCreated } from "./internal/tables-created-event";
export type { ConversationCreatedPayload } from "./internal/tables-created-event";
export { userTurnSent } from "./internal/tables-user-turn-sent-event";
export type { UserTurnSentPayload } from "./internal/tables-user-turn-sent-event";
export { SYSTEM_META_TASK_ID } from "./internal/meta-system";

export default {
  id: "conversations",
  name: "Conversations",
  description:
    "Conversation domain: shared server code and types; view plugins live under `plugins/`.",
  loadBearing: true,
  httpRoutes: {
    "GET /api/conversations": handleList,
    "GET /api/conversations/gone": handleListGone,
    "GET /api/conversations/:id": handleGet,
    "POST /api/conversations": handleCreate,
    "DELETE /api/conversations": handleDelete,
    "POST /api/conversations/:id/turn": handlePostTurn,
    "POST /api/conversations/:id/stop": handleStop,
    "GET /api/conversations/:id/turns": handleListTurns,
    "POST /api/conversations/:id/close": handleClose,
  },
  // recentConversationsResource is now mounted on tasks-core; only fork-errors stays here.
  contributions: [Resource.Declare(forkErrorsResource)],
  register: [maybeLaunchTaskJob, maybeLaunchDependentsJob, conversationCreated, conversationTurnCompleted, userTurnSent],
  onReady: async () => {
    await ensureSystemMeta();
    startPoller();
    startTurnEmitter();

    // Sweep stale per-dep oneShot rows from old armTaskAutoStart calls.
    await deleteTriggersFor(maybeLaunchTaskJob);
    // Single static trigger replaces all dynamic per-dep triggers.
    await deleteTriggersFor(maybeLaunchDependentsJob);
    await trigger({
      on: taskStatusChanged,
      do: maybeLaunchDependentsJob,
      with: {},
      oneShot: false,
    });
  },
} satisfies ServerPluginDefinition;
