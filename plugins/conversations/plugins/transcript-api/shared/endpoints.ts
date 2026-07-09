import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getConversationTranscript = defineEndpoint({
  route: "GET /api/conversations/:id/transcript",
  response: z.object({
    /**
     * The conversation's session chain, oldest → newest. A conversation whose
     * Claude session was relocated (fork, resume into a new id) spans several
     * files; read them in this order. Empty = no transcript on disk yet.
     */
    paths: z.array(z.string()),
  }),
});
