import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// --- Body schemas ---

export const SetCategoryBodySchema = z.object({
  category: z.string().min(1),
});
export type SetCategoryBody = z.infer<typeof SetCategoryBodySchema>;

// --- Endpoint definitions ---

export const classifyConversation = defineEndpoint({
  route: "POST /api/conversation-category/:conversationId/classify",
});

export const setConversationCategory = defineEndpoint({
  route: "POST /api/conversation-category/:conversationId",
  body: SetCategoryBodySchema,
});

export const clearConversationCategory = defineEndpoint({
  route: "DELETE /api/conversation-category/:conversationId",
});
