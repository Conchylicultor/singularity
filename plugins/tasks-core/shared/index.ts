// Zod schemas and TS types only — no db queries, safe to import from web code.
export {
  TaskSchema,
  TaskStatusSchema,
  AttemptSchema,
  AttemptStatusSchema,
  PushSchema,
  ConversationSchema,
  ConversationKindSchema,
} from "../server/internal/schema";
import type {
  Attempt,
  Conversation,
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

// The attemptsResource payload embeds a narrow summary of each attempt's
// conversations so that the tasks plugin doesn't have to subscribe to the
// bounded recentConversationsResource just to render attempt rows.
export type ConversationSummary = Pick<Conversation, "id" | "title" | "status">;
export type AttemptWithConversations = Attempt & {
  conversations: ConversationSummary[];
};
