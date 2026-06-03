import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleClose } from "./internal/handle-close";
import { handleList } from "./internal/handle-list";
import { handleListGone } from "./internal/handle-list-gone";
import { handleCreate } from "./internal/handle-create";
import { handleDelete } from "./internal/handle-delete";
import { handleGet } from "./internal/handle-get";
import { handleListTurns } from "./internal/handle-list-turns";
import { handlePostTurn } from "./internal/handle-post-turn";
import { handleStop } from "./internal/handle-stop";
import {
  listConversations,
  listGoneConversations,
  getConversation,
  createConversation,
  deleteConversation,
  postConversationTurn,
  stopConversation,
  listConversationTurns,
  closeConversation,
} from "../core/endpoints";
import { startPoller } from "./internal/poller";
import { startTurnEmitter } from "./internal/turn-emitter";
import { ensureSystemMeta } from "./internal/meta-system";
import {
  maybeLaunchTaskJob,
  maybeLaunchDependentsJob,
} from "./internal/auto-start-jobs";
import { notifyConversationCreatedJob } from "./internal/notify-created-job";
import { conversationCreated } from "./internal/tables-created-event";
import { conversationTurnCompleted } from "./internal/tables-turn-completed-event";
import { userTurnSent } from "./internal/tables-user-turn-sent-event";
import { taskStatusChanged } from "@plugins/tasks-core/server";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { ConfigV2 } from "@plugins/config_v2/server";
import { autoAnswerConfig } from "../shared/config";

export { maybeLaunchTaskJob } from "./internal/auto-start-jobs";

export { ConversationStatusSchema, isActiveStatus, hasLiveProcess } from "./status";
export type { ConversationStatus } from "./status";
export { createConversation, deleteConversation, resumeConversation } from "./internal/lifecycle";
export type { Turn } from "./internal/claude-transcript";
export {
  Runtime,
  answerPrompt,
  flushInteractivePrompt,
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
    [listConversations.route]: handleList,
    [listGoneConversations.route]: handleListGone,
    [getConversation.route]: handleGet,
    [createConversation.route]: handleCreate,
    [deleteConversation.route]: handleDelete,
    [postConversationTurn.route]: handlePostTurn,
    [stopConversation.route]: handleStop,
    [listConversationTurns.route]: handleListTurns,
    [closeConversation.route]: handleClose,
  },
  // conversationsLiveResource is mounted on tasks-core.
  contributions: [
    ConfigV2.Register({ descriptor: autoAnswerConfig }),
    Trigger({ on: taskStatusChanged, do: maybeLaunchDependentsJob, with: {}, oneShot: false }),
    Trigger({ on: conversationCreated, do: notifyConversationCreatedJob, with: {}, oneShot: false }),
  ],
  register: [maybeLaunchTaskJob, maybeLaunchDependentsJob, notifyConversationCreatedJob, conversationCreated, conversationTurnCompleted, userTurnSent],
  onReady: async () => {
    await ensureSystemMeta();
    startPoller();
    startTurnEmitter();
  },
} satisfies ServerPluginDefinition;
