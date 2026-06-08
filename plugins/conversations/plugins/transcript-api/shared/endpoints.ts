import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getConversationTranscript = defineEndpoint({
  route: "GET /api/conversations/:id/transcript",
  response: z.object({
    path: z.string().nullable(),
  }),
});
