import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// --- Body schemas ---

export const SetCategoryItemBodySchema = z.object({
  categoryId: z.string().min(1),
  item: z.string().min(1),
});
export type SetCategoryItemBody = z.infer<typeof SetCategoryItemBodySchema>;

// An empty/absent `categoryIds` means "every configured category". A non-empty
// list restricts the run to those categories — that is how a single chip's
// "Re-classify" button asks for just its own axis.
export const ClassifyBodySchema = z.object({
  categoryIds: z.array(z.string()).optional(),
});
export type ClassifyBody = z.infer<typeof ClassifyBodySchema>;

// --- Endpoint definitions ---

export const classifyConversation = defineEndpoint({
  route: "POST /api/conversation-category/:conversationId/classify",
  body: ClassifyBodySchema,
});

export const setConversationCategory = defineEndpoint({
  route: "POST /api/conversation-category/:conversationId",
  body: SetCategoryItemBodySchema,
});

export const clearConversationCategory = defineEndpoint({
  route: "DELETE /api/conversation-category/:conversationId/:categoryId",
});
