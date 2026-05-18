import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const RestoreBatchBodySchema = z.object({
  ids: z.array(z.string()),
});
export type RestoreBatchBody = z.infer<typeof RestoreBatchBodySchema>;

export const restoreBatch = defineEndpoint({
  route: "POST /api/conversations-recover/restore-batch",
  body: RestoreBatchBodySchema,
});
