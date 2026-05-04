import type { ServerPluginDefinition } from "@server/types";
import {
  tasksResource,
  attemptsResource,
  pushesResource,
  recentConversationsResource,
} from "./internal/resources";
import { pushLanded, taskStatusChanged } from "./internal/tables-events";
import { sweepOrphanedAttempts } from "./internal/sweep-orphaned-attempts";

// Per-domain attachment link handles (FK cascade on owner deletion). In their
// own file so they don't leak server-only imports into tasks-core/shared.
// The underlying pgTables stay in `internal/` — only the handles are exported.
export {
  taskAttachments,
  conversationAttachments,
} from "./internal/schema-attachments";
export { _tasks, _conversations } from "./internal/tables";

// Zod schemas and TS types
export {
  TaskSchema,
  TaskStatusSchema,
  AttemptSchema,
  AttemptStatusSchema,
  PushSchema,
  ConversationSchema,
  ConversationKindSchema,
} from "./internal/schema";
export type {
  Task,
  TaskStatus,
  Attempt,
  AttemptStatus,
  Push,
  Conversation,
  ConversationKind,
} from "./internal/schema";

// Resources (four resources, all owned here)
export {
  tasksResource,
  attemptsResource,
  pushesResource,
  recentConversationsResource,
} from "./internal/resources";
export type {
  AttemptWithConversations,
  ConversationSummary,
} from "../shared";

// Query functions — reads
export {
  listTasks,
  getTask,
  hasBlockingDep,
  findNextRankUnder,
  isDescendant,
  taskDependsOn,
} from "./internal/queries/tasks";
export type { TaskFilters } from "./internal/queries/tasks";

export {
  listAttempts,
  getAttempt,
  listAttemptsForTask,
} from "./internal/queries/attempts";

export {
  listConversationsForInfra,
  listConversationsForDisplay,
  listActiveConversations,
  listActiveSystemConversations,
  listGoneConversations,
  getConversation,
  getConversationRuntime,
  getConversationClaudeSessionId,
  RECENT_GONE_LIMIT,
} from "./internal/queries/conversations";

export {
  listPushes,
  listPushesForAttempt,
  listPushesByPushId,
  getLatestPush,
  listPushShasIn,
} from "./internal/queries/pushes";

// Mutation functions — writes (all call .notify() internally)
export {
  CONVERSATIONS_META_TASK_ID,
  createTask,
  updateTask,
  updateTaskTitle,
  deleteTask,
  addTaskDependency,
  removeTaskDependency,
  ensureMetaTask,
  backfillMetaParent,
} from "./internal/mutations/tasks";
export type {
  CreateTaskInput,
  UpdateTaskPatch,
} from "./internal/mutations/tasks";

export { createAttempt, deleteAttempt } from "./internal/mutations/attempts";
export type { CreateAttemptInput } from "./internal/mutations/attempts";

export {
  insertConversation,
  insertConversationOnConflictDoNothing,
  updateConversation,
  updateConversationsTitleForTask,
  deleteConversationRow,
  markConversationClosed,
} from "./internal/mutations/conversations";
export type {
  InsertConversationInput,
  UpdateConversationPatch,
} from "./internal/mutations/conversations";

export { insertPush } from "./internal/mutations/pushes";
export type { InsertPushInput } from "./internal/mutations/pushes";

// Event emitted after a push row is inserted. Consumers subscribe via
// @plugins/infra/plugins/events/server `trigger({ on: pushLanded, do: <job> })`.
export { pushLanded, _pushLandedTriggers } from "./internal/tables-events";
export type { PushLandedPayload } from "./internal/tables-events";

// Emitted when a task's computed status flips. Filterable by taskId and
// status so consumers can subscribe to a specific transition (e.g. parent
// task X reaching status='done').
export {
  taskStatusChanged,
  _taskStatusChangedTriggers,
} from "./internal/tables-events";
export type { TaskStatusChangedPayload } from "./internal/tables-events";

// Helpers to read the derived status of a task and emit a status-change
// event when it flips. Used internally by tasks-core mutations and exposed
// for plugins that perform writes outside the core mutation surface.
export { readTaskStatus, emitStatusChangeIfChanged } from "./internal/status-emit";

export { adoptOrphanConversation } from "./internal/mutations/cross-table";
export type { AdoptOrphanInput } from "./internal/mutations/cross-table";

export default {
  id: "tasks-core",
  name: "Tasks Core",
  description:
    "Schema + repository layer for the tasks/attempts/conversations FK cluster.",
  loadBearing: true,
  resources: [tasksResource, attemptsResource, pushesResource, recentConversationsResource],
  register: [pushLanded, taskStatusChanged],
  onReady: sweepOrphanedAttempts,
} satisfies ServerPluginDefinition;
