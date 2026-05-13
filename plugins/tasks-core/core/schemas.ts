import { z } from "zod";
import { AttemptSchema, ConversationSchema } from "../server/internal/schema";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

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

const ConversationListPayloadSchema = z.object({
  active: z.array(ConversationSchema),
  recentGone: z.array(ConversationSchema),
  hasMoreGone: z.boolean(),
  totalGoneCount: z.number(),
  system: z.array(ConversationSchema),
});
export type ConversationListPayload = z.infer<typeof ConversationListPayloadSchema>;

export const conversationsResource = resourceDescriptor<ConversationListPayload>(
  "conversations",
  ConversationListPayloadSchema,
  { active: [], recentGone: [], hasMoreGone: false, totalGoneCount: 0, system: [] },
);
