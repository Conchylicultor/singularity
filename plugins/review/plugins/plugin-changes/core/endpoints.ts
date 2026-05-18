import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const pluginChangesResponse = z.object({ plugins: z.array(z.any()) });

export const getPluginChanges = defineEndpoint({
  route: "GET /api/review/plugin-changes",
  query: z.object({
    conversationId: z.string(),
    pushId: z.string().optional(),
  }),
  response: pluginChangesResponse,
});
