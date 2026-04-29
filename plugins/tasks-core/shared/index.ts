export {
  TaskSchema,
  TaskStatusSchema,
  AttemptSchema,
  AttemptStatusSchema,
  PushSchema,
  ConversationSchema,
  ConversationKindSchema,
} from "../server/internal/schema";
export type {
  Task,
  TaskStatus,
  Attempt,
  AttemptStatus,
  Push,
  Conversation,
  ConversationKind,
} from "../server/internal/schema";
export {
  ConversationSummarySchema,
  AttemptWithConversationsSchema,
  ConversationListPayloadSchema,
} from "./schemas";
export type {
  ConversationSummary,
  AttemptWithConversations,
  ConversationListPayload,
} from "./schemas";

// Single source of truth for the prompt shape used to launch a task — both the
// task-detail Launch buttons and the auto-start job route through this so the
// two paths cannot drift (description preserved when present; title alone
// otherwise).
export function buildTaskPrompt(
  task: { title?: string | null; description?: string | null },
): string {
  const title = (task.title ?? "").trim() || "Untitled";
  const desc = (task.description ?? "").trim();
  return desc ? `${title}\n\n${desc}` : title;
}
