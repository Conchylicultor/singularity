export {
  TaskSchema,
  TaskListItemSchema,
  TaskStatusSchema,
  AttemptSchema,
  AttemptStatusSchema,
  PushSchema,
  ConversationSchema,
  ConversationKindSchema,
} from "../server/internal/schema";
export type {
  Task,
  TaskListItem,
  TaskStatus,
  Attempt,
  AttemptStatus,
  Push,
  Conversation,
  ConversationKind,
} from "../server/internal/schema";
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
