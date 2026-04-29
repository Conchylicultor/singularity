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
export type {
  Task,
  TaskStatus,
  Attempt,
  AttemptStatus,
  Push,
  Conversation,
  ConversationKind,
} from "../server/internal/schema";

import { z } from "zod";
import { AttemptSchema, ConversationSchema } from "../server/internal/schema";

// The attemptsResource payload embeds a narrow summary of each attempt's
// conversations so that the tasks plugin doesn't have to subscribe to the
// bounded recentConversationsResource just to render attempt rows. Carries
// the columns the conversation-ui/item visual primitive needs.
export const ConversationSummarySchema = ConversationSchema.pick({
  id: true,
  title: true,
  status: true,
  kind: true,
  createdAt: true,
  spawnedBy: true,
});
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

export const AttemptWithConversationsSchema = AttemptSchema.extend({
  conversations: z.array(ConversationSummarySchema),
});
export type AttemptWithConversations = z.infer<typeof AttemptWithConversationsSchema>;

export const ConversationListPayloadSchema = z.object({
  active: z.array(ConversationSchema),
  recentGone: z.array(ConversationSchema),
  hasMoreGone: z.boolean(),
  totalGoneCount: z.number(),
  system: z.array(ConversationSchema),
});
export type ConversationListPayload = z.infer<typeof ConversationListPayloadSchema>;
