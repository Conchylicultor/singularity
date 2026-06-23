import { z } from "zod";

// The jsonb payload for the "slow-op" report. The report fingerprint keys on
// (operationKind, operation), so each distinct slow op owns its own task; the
// payload carries that op's identity plus its latest tripping duration —
// fingerprint, task title/description, and message all read from it. The full
// ranked breakdown (totals, max, caller attribution) lives in the slow_ops store
// / Debug → Slow Ops, which each task points into.
export const SlowOpReportPayloadSchema = z.object({
  operationKind: z.string(),
  operation: z.string(),
  durationMs: z.number(),
  thresholdMs: z.number(),
});
export type SlowOpReportPayload = z.infer<typeof SlowOpReportPayloadSchema>;
