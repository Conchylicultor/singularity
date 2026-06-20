import { z } from "zod";

// The jsonb payload for a `queue-dead-job` report. One report per distinct
// `jobName` (a retry-storm of one broken job collapses to a single task), so the
// payload carries the per-job rollup: how many terminally-dead rows, the
// attempt counters, the latest error text, and a sample graphile job id for
// hand-inspection in the queue pane.
export const QueueDeadJobPayloadSchema = z.object({
  jobName: z.string(),
  deadCount: z.number().int(),
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  lastError: z.string().nullable(),
  sampleJobId: z.string().nullable(),
});
export type QueueDeadJobPayload = z.infer<typeof QueueDeadJobPayloadSchema>;

// The jsonb payload for the singleton `queue-backlog` rollup report. Carries the
// aggregate snapshot that tripped the threshold: how many ready jobs are
// waiting, how overdue the oldest one is, how many are currently locked (running),
// and whether the worker is making no progress (stalled).
export const QueueBacklogPayloadSchema = z.object({
  readyCount: z.number().int(),
  oldestOverdueMs: z.number().int(),
  lockedCount: z.number().int(),
  stalled: z.boolean(),
});
export type QueueBacklogPayload = z.infer<typeof QueueBacklogPayloadSchema>;
