import { z } from "zod";
import { AttemptSchema, ConversationSchema } from "../server/internal/schema";

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
