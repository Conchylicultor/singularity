import type { ServerPluginDefinition } from "@server/types";
import {
  tasksResource,
  attemptsResource,
  pushesResource,
  recentConversationsResource,
} from "./internal/resources";

// Task ↔ attachment link table (FK cascade on task deletion). In its own
// file so it doesn't leak server-only imports into tasks-core/shared.
export { _taskAttachments } from "./internal/schema-attachments";

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
  listConversations,
  listConversationsForDisplay,
  listActiveConversations,
  listRecentGoneConversations,
  listGoneConversationsBefore,
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

export { createAttempt } from "./internal/mutations/attempts";
export type { CreateAttemptInput } from "./internal/mutations/attempts";

export {
  insertConversation,
  insertConversationOnConflictDoNothing,
  updateConversation,
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
// @plugins/events/server `trigger({ on: pushLanded, do: <job> })`.
export { pushLanded, _pushLandedTriggers } from "./internal/tables-events";
export type { PushLandedPayload } from "./internal/tables-events";

export { adoptOrphanConversation } from "./internal/mutations/cross-table";
export type { AdoptOrphanInput } from "./internal/mutations/cross-table";

export default {
  id: "tasks-core",
  name: "Tasks Core",
  description:
    "Schema + repository layer for the tasks/attempts/conversations FK cluster.",
  resources: [tasksResource, attemptsResource, pushesResource, recentConversationsResource],
} satisfies ServerPluginDefinition;
