import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// --- Body schemas ---

export const SetCategoryBodySchema = z.object({
  category: z.string().min(1),
});
export type SetCategoryBody = z.infer<typeof SetCategoryBodySchema>;

export const SetColorBodySchema = z.object({
  category: z.string().min(1),
  colorKey: z.string().nullable().optional(),
  iconKey: z.string().nullable().optional(),
  iconSvgNodes: z.string().nullable().optional(),
});
export type SetColorBody = z.infer<typeof SetColorBodySchema>;

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

export const getCategoryColors = defineEndpoint({
  route: "GET /api/conversation-category/colors",
});

export const setCategoryColor = defineEndpoint({
  route: "POST /api/conversation-category/colors",
  body: SetColorBodySchema,
});

export const deleteCategoryColor = defineEndpoint({
  route: "DELETE /api/conversation-category/colors/:category",
});
