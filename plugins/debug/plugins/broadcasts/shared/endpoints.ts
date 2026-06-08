import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

const BroadcastEntrySchema = z.object({
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  since: z.string().optional(),
  until: z.string().optional(),
  commands: z.array(z.enum(["build", "push", "check"])).optional(),
});
export type BroadcastEntry = z.infer<typeof BroadcastEntrySchema>;

const GetBroadcastsResponseSchema = z.object({
  ok: z.literal(true),
  entries: z.array(BroadcastEntrySchema),
  path: z.string(),
});
export type GetBroadcastsResponse = z.infer<typeof GetBroadcastsResponseSchema>;

export const getBroadcasts = defineEndpoint({
  route: "GET /api/debug/broadcasts",
  response: GetBroadcastsResponseSchema,
});

export const WriteBroadcastsBodySchema = z.object({
  entries: z.array(z.unknown()),
});
export type WriteBroadcastsBody = z.infer<typeof WriteBroadcastsBodySchema>;

const WriteBroadcastsResponseSchema = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type WriteBroadcastsResponse = z.infer<typeof WriteBroadcastsResponseSchema>;

export const writeBroadcasts = defineEndpoint({
  route: "PUT /api/debug/broadcasts",
  body: WriteBroadcastsBodySchema,
  response: WriteBroadcastsResponseSchema,
});
