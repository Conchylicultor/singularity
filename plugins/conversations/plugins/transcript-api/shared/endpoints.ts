import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getConversationTranscript = defineEndpoint({
  route: "GET /api/conversations/:id/transcript",
});
