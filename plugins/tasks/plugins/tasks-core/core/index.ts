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
export { ConversationStatusSchema } from "./conversation-status";
export type { ConversationStatus } from "./conversation-status";
export {
  ConversationSummarySchema,
  AttemptWithConversationsSchema,
} from "./schemas";
export type {
  ConversationSummary,
  AttemptWithConversations,
} from "./schemas";

// Client/shared live-state descriptors (single source of truth for key/schema/
// keyed-ness; the server resources are built from these). See ./resources.ts.
export {
  tasksResource,
  taskDetailResource,
  attemptsResource,
  pushesResource,
  conversationsActiveResource,
  conversationsSystemResource,
  conversationsGoneResource,
  conversationsGoneStatsResource,
  RECENT_GONE_LIMIT,
} from "./resources";

export { buildTaskPrompt } from "./build-task-prompt";

// The single dependency-graph value object + settled predicate. Every traversal
// (badge counts, drop sets, the launch gate, cycle checks, the graph view)
// derives from this one model. See ./task-graph.ts.
export { TaskGraph, isSettled, SETTLED_STATUSES } from "./task-graph";
export type { TaskNode } from "./task-graph";

export { tasksRootRoute, taskDetailRoute } from "./routes";
