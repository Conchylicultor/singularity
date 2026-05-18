import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const generateConversationSummary = defineEndpoint({
  route: "POST /api/conversation-summary/:conversationId/generate",
});
