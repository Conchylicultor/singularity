import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";

export const ConversationCategorySchema = z.object({
  conversationId: z.string(),
  category: z.string(),
  source: z.enum(["haiku", "manual"]),
  classifiedAt: z.coerce.date(),
});
export type ConversationCategory = z.infer<typeof ConversationCategorySchema>;

export const ConversationCategoriesPayloadSchema = z.array(
  ConversationCategorySchema,
);
export type ConversationCategoriesPayload = z.infer<
  typeof ConversationCategoriesPayloadSchema
>;

export const conversationCategoriesResource = resourceDescriptor<ConversationCategoriesPayload>(
  "conversation-categories",
  ConversationCategoriesPayloadSchema,
  [],
);
