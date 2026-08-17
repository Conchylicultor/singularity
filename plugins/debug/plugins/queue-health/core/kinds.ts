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

// The top-N per-jobName ready-queue attribution, shared verbatim by the backlog
// rollup and the wedge report — both answer "who is waiting behind this" from
// the same `queryBacklogByJobName()` rows, so they carry the same shape.
const TopReadySchema = z.array(
  z.object({
    jobName: z.string(),
    readyCount: z.number().int(),
    oldestOverdueMs: z.number().int(),
  }),
);

// The jsonb payload for the singleton `queue-backlog` rollup report. Carries the
// aggregate snapshot that tripped the threshold: how many ready jobs are
// waiting, how overdue the oldest one is, how many are currently locked (running),
// and whether the worker is making no progress (stalled). `topReady` attributes
// the ready backlog to the jobs filling it — OPTIONAL so already-stored reports
// (filed before this field existed) still parse.
export const QueueBacklogPayloadSchema = z.object({
  readyCount: z.number().int(),
  oldestOverdueMs: z.number().int(),
  lockedCount: z.number().int(),
  stalled: z.boolean(),
  topReady: TopReadySchema.optional(),
});
export type QueueBacklogPayload = z.infer<typeof QueueBacklogPayloadSchema>;

// The jsonb payload for a `queue-slot-hog` report. One report per distinct
// `jobName` (fingerprint `queue-slot-hog:<jobName>`), naming a job that has held
// a worker slot from the shared pool longer than the configured threshold —
// starving the queue even while `lockedCount > 0` (the exact wedge the backlog
// `stalled` signal, which only trips at `lockedCount === 0`, cannot see).
export const QueueSlotHogPayloadSchema = z.object({
  jobName: z.string(),
  lockedForMs: z.number().int(),
  runningCount: z.number().int(),
  sampleJobId: z.string().nullable(),
});
export type QueueSlotHogPayload = z.infer<typeof QueueSlotHogPayloadSchema>;

// The jsonb payload for a `queue-wedged` report — the queue has STOPPED
// DRAINING, which is a different claim from either of the two above.
// `queue-backlog` says the queue is deep and `queue-slot-hog` says one job is
// slow; both are routinely true and benign (the nightly `backup.run` trips
// slot-hog every night). This one only fires when every slot is held by the
// SAME live jobs across consecutive samples while ready work waits — nothing is
// completing, so nothing behind it will ever start.
//
// `heldForMs` is the minimum `lockedForMs` across the holders — i.e. every slot
// has been held at least this long. Read off graphile's `locked_at`, NOT off how
// long the watchdog has been watching: a backend that boots into an
// already-wedged queue must report the true 14 minutes, not the 3 it has been
// awake for.
export const QueueWedgedPayloadSchema = z.object({
  concurrency: z.number().int(),
  readyCount: z.number().int(),
  heldForMs: z.number().int(),
  holders: z.array(
    z.object({
      jobName: z.string(),
      jobId: z.string(),
      lockedForMs: z.number().int(),
    }),
  ),
  topReady: TopReadySchema.optional(),
});
export type QueueWedgedPayload = z.infer<typeof QueueWedgedPayloadSchema>;
