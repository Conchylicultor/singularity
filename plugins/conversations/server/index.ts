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
import {
  maybeLaunchTaskJob,
  maybeLaunchDependentsJob,
} from "./internal/auto-start-jobs";
import { notifyConversationCreatedJob } from "./internal/notify-created-job";
import { spawnConversationJob } from "./internal/spawn-job";
import { conversationCreated } from "./internal/tables-created-event";
import { conversationTurnCompleted } from "./internal/tables-turn-completed-event";
import { userTurnSent } from "./internal/tables-user-turn-sent-event";
import { taskStatusChanged } from "@plugins/tasks/plugins/tasks-core/server";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { TaskCategory } from "@plugins/tasks/plugins/task-category/server";
import { ConfigV2 } from "@plugins/config_v2/server";
import { autoAnswerConfig } from "../shared/config";
import { queryConversations } from "@plugins/conversations/plugins/all-conversations/core";
import { handleQuery } from "@plugins/conversations/plugins/all-conversations/server";

export { maybeLaunchTaskJob } from "./internal/auto-start-jobs";

export { isActiveStatus, hasLiveProcess } from "./status";
export { createConversation, deleteConversation, resumeConversation, ensureResumed } from "./internal/lifecycle";
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

export default {
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
    [queryConversations.route]: handleQuery,
  },
  // The conversations live resources (active/system/gone/gone-stats) are mounted on tasks-core.
  contributions: [
    ConfigV2.Register({ descriptor: autoAnswerConfig }),
    Trigger({ on: taskStatusChanged, do: maybeLaunchDependentsJob, with: {}, oneShot: false }),
    Trigger({ on: conversationCreated, do: notifyConversationCreatedJob, with: {}, oneShot: false }),
    TaskCategory({ id: "conversations", label: "Conversations", order: 0 }),
    TaskCategory({ id: "system", label: "System", order: 1 }),
  ],
  register: [maybeLaunchTaskJob, maybeLaunchDependentsJob, notifyConversationCreatedJob, spawnConversationJob, conversationCreated, conversationTurnCompleted, userTurnSent],
  onReady: () => {
    startPoller();
    startTurnEmitter();
  },
} satisfies ServerPluginDefinition;
