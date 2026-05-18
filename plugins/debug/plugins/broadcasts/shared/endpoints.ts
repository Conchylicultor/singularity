import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getBroadcasts = defineEndpoint({
  route: "GET /api/debug/broadcasts",
});

export const WriteBroadcastsBodySchema = z.object({
  entries: z.array(z.unknown()),
});
export type WriteBroadcastsBody = z.infer<typeof WriteBroadcastsBodySchema>;

export const writeBroadcasts = defineEndpoint({
  route: "PUT /api/debug/broadcasts",
  body: WriteBroadcastsBodySchema,
});
