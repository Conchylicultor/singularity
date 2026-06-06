import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

export const ConversationPrepromptSchema = z.object({
  conversationId: z.string(),
  prepromptId: z.string(),
  title: z.string(),
  text: z.string(),
  updatedAt: z.coerce.date(),
});
export type ConversationPreprompt = z.infer<typeof ConversationPrepromptSchema>;

export const ConversationPrepromptsPayloadSchema = z.record(
  z.string(),
  ConversationPrepromptSchema,
);
export type ConversationPrepromptsPayload = z.infer<
  typeof ConversationPrepromptsPayloadSchema
>;

export const conversationPrepromptsResource = resourceDescriptor<ConversationPrepromptsPayload>(
  "conversation-preprompts",
  ConversationPrepromptsPayloadSchema,
  {},
);
