import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { View } from "@plugins/database/plugins/derived-views/server";
import { DerivedTable } from "@plugins/database/plugins/derived-tables/server";
import { attemptConvAggSpec, attemptPushAggSpec } from "./internal/rollup-spec";
import {
  tasksResource,
  taskDetailResource,
  attemptsResource,
  pushesResource,
  conversationsActiveResource,
  conversationsSystemResource,
  conversationsGoneResource,
  conversationsGoneStatsResource,
  pushesByAttemptResource,
} from "./internal/resources";
import { attempts, conversations, taskBlocking, tasks } from "./internal/views";
import {
  pushLanded,
  taskStatusChanged,
  conversationStatusChanged,
} from "./internal/tables-events";
import { sweepOrphanedAttempts } from "./internal/sweep-orphaned-attempts";

// Per-domain attachment link handles (FK cascade on owner deletion). In their
// own file so they don't leak server-only imports into tasks-core/shared.
// The underlying pgTables stay in `internal/` — only the handles are exported.
export {
  taskAttachments,
  conversationAttachments,
} from "./internal/schema-attachments";
export { _tasks, _attempts, _conversations } from "./internal/tables";
// The derived `conversations_v` relation (carries worktreePath / taskId / active
// on top of the base columns). Exposed so the All-conversations query compiler can
// bind its FieldColumnMap to the SAME view the live resources read.
export { conversations as conversationsView } from "./internal/views";
// The derived `tasks_v` relation. A task's `status` is COMPUTED there and exists
// as no column of `tasks`, so a consumer that needs the status of a SET of tasks
// in one query has nowhere else to read it — and a `tasks_v` read costs the same
// whether it asks for one id or fifty, so per-id reads turn a page read into one
// full-graph round trip per linked task. Bound to the same view the live
// resources read, for the same reason `conversationsView` is. Today's consumer
// is `page/annotations/todo/task-link`'s markdown provider.
export { tasks as tasksView } from "./internal/views";

// Zod schemas and TS types
export {
  TaskSchema,
  TaskListItemSchema,
  TaskStatusSchema,
  AttemptSchema,
  AttemptStatusSchema,
  PushSchema,
  ConversationSchema,
  ConversationKindSchema,
} from "./internal/schema";
export type {
  Task,
  TaskListItem,
  TaskStatus,
  Attempt,
  AttemptStatus,
  Push,
  Conversation,
  ConversationKind,
} from "./internal/schema";

// Resources (all owned here)
export {
  tasksResource,
  taskDetailResource,
  attemptsResource,
  pushesResource,
  conversationsActiveResource,
  conversationsSystemResource,
  conversationsGoneResource,
  conversationsGoneStatsResource,
  pushesByAttemptResource,
} from "./internal/resources";
export type { AttemptWithConversations, ConversationSummary } from "../core";

// Query functions — reads
export {
  listTasks,
  getTask,
  hasBlockingDep,
  listBlockingDepIds,
  listDependentIds,
  getTaskDependencyIds,
  findNextRankInFolder,
  isDescendant,
  taskDependsOn,
} from "./internal/queries/tasks";

export {
  listAttempts,
  getAttempt,
  listAttemptsForTask,
} from "./internal/queries/attempts";

export {
  listConversationsForInfra,
  listExistingConversationIds,
  listConversationsForDisplay,
  listConversationIdsForAttempt,
  listActiveConversations,
  listRetainedConversations,
  conversationCascadeSignatures,
  listGoneConversations,
  getConversation,
  getConversationRuntime,
  getConversationClaudeSessionId,
  listHibernationCandidates,
  RECENT_GONE_LIMIT,
} from "./internal/queries/conversations";

export {
  listPushes,
  listPushesForAttempt,
  listPushesByPushId,
  getLatestPush,
  listPushShasIn,
} from "./internal/queries/pushes";

// Mutation functions — writes (live-state invalidation is DB-feed-driven)
export {
  createTask,
  updateTask,
  updateTaskTitle,
  dropTaskTree,
  addTaskDependency,
  removeTaskDependency,
} from "./internal/mutations/tasks";
export type {
  CreateTaskInput,
  UpdateTaskPatch,
} from "./internal/mutations/tasks";

// Monotone dependency-tree membership (`tasks.clusterId`). Every writer of a
// membership edge (dependency edge or `folderId`) must union at or before the
// edge write; nothing ever un-unions.
export {
  clusterLabelOf,
  unionTaskClusters,
} from "./internal/mutations/clusters";

export { createAttempt, deleteAttempt } from "./internal/mutations/attempts";
export type { CreateAttemptInput } from "./internal/mutations/attempts";

export {
  insertConversation,
  insertConversationOnConflictDoNothing,
  updateConversation,
  updateConversationsTitleForTask,
  deleteConversationRow,
  markConversationGone,
  markConversationClosed,
  setConversationHibernated,
  touchConversationViewed,
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

// Emitted at the conversation status-write chokepoint whenever a single
// conversation's status column changes. Finer-grained than taskStatusChanged;
// the queue plugin subscribes to revalidate the focus pin.
export {
  conversationStatusChanged,
  _conversationStatusChangedTriggers,
} from "./internal/tables-events";
export type { ConversationStatusChangedPayload } from "./internal/tables-events";

// Coalesce a multi-edge dependency mutation to one DB transaction and at most
// one net tasks.statusChanged per affected task. Consumers thread the provided
// `tx` (a DbExecutor) to the dependency mutations they call. `runStatusBatchOn`
// is the same batch joined onto a transaction the caller already owns.
//
// There is deliberately no exported "snapshot the status / emit if it changed"
// pair any more: naming the affected tasks was the defect (an edge write can
// only name its own endpoint), so the recording is now internal to
// `withTaskStatusChange`, which derives the affected set from the graph and
// brackets the write itself.
export { withTaskStatusBatch, runStatusBatchOn } from "./internal/status-batch";
export type { DbExecutor } from "./internal/status-batch";

export {
  adoptOrphanConversation,
  dropTaskIfNoActiveSibling,
} from "./internal/mutations/cross-table";
export type { AdoptOrphanInput } from "./internal/mutations/cross-table";

export default {
  description:
    "Schema + repository layer for the tasks/attempts/conversations FK cluster.",
  loadBearing: true,
  contributions: [
    Resource.Declare(tasksResource),
    Resource.Declare(taskDetailResource),
    Resource.Declare(attemptsResource),
    Resource.Declare(pushesResource),
    Resource.Declare(pushesByAttemptResource),
    Resource.Declare(conversationsActiveResource),
    Resource.Declare(conversationsSystemResource),
    Resource.Declare(conversationsGoneResource),
    Resource.Declare(conversationsGoneStatsResource),
    DerivedTable(attemptConvAggSpec),
    DerivedTable(attemptPushAggSpec),
    View({ view: attempts, identityTable: "attempts" }),
    View({ view: conversations, identityTable: "conversations" }),
    View({ view: taskBlocking, dependsOn: ["attempts_v"] }),
    View({
      view: tasks,
      dependsOn: ["attempts_v", "task_blocking_v"],
      identityTable: "tasks",
    }),
  ],
  register: [pushLanded, taskStatusChanged, conversationStatusChanged],
  onReady: sweepOrphanedAttempts,
} satisfies ServerPluginDefinition;
