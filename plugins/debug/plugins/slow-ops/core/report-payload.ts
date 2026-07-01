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
  // Optional, backward-compatible cold-start attribution (element signal only).
  // Stored in the report's jsonb `data`, so no migration. When present and true,
  // renderTask/renderDescription append that the measured duration was
  // transport bring-up (time-to-first-data), not this resource's own compute —
  // pointing the investigation at transport/boot readiness, not the resource.
  transportColdStart: z.boolean().optional(),
  transportWaitMs: z.number().optional(),
});
export type SlowOpReportPayload = z.infer<typeof SlowOpReportPayloadSchema>;
