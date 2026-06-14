import { z } from "zod";

// The jsonb payload for the singleton "slow-op" rollup report. The rollup task
// is a pointer to Debug → Slow Ops, not a per-operation record (the live ranked
// data lives in the slow_ops store), so the payload only carries the latest
// operation that tripped a threshold — enough to make the task message useful.
export const SlowOpReportPayloadSchema = z.object({
  operationKind: z.string(),
  operation: z.string(),
  durationMs: z.number(),
  thresholdMs: z.number(),
});
export type SlowOpReportPayload = z.infer<typeof SlowOpReportPayloadSchema>;
