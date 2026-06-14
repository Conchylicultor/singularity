import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// The two client-side slow-op signals (page-load, element-settle) POST here.
// `operationKind` is "page-load" | "element" — a client origin with no parent
// span, so the funnel records it with no caller attribution. The server stamps
// the worktree; the client only supplies the measurement.
export const SlowOpClientBodySchema = z.object({
  operationKind: z.string(),
  operation: z.string(),
  durationMs: z.number(),
  thresholdMs: z.number(),
});
export type SlowOpClientBody = z.infer<typeof SlowOpClientBodySchema>;

export const submitClientSlowOp = defineEndpoint({
  route: "POST /api/slow-ops/client",
  body: SlowOpClientBodySchema,
  response: z.object({ ok: z.boolean() }),
});
