import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { HoldClassSchema } from "./hold";

export const JobStateSchema = z.enum([
  "pending",
  "running",
  "retrying",
  "dead",
]);
export type JobState = z.infer<typeof JobStateSchema>;

export const JobRowSchema = z.object({
  id: z.string(),
  jobName: z.string(),
  /**
   * The row's duration class — which tier of the runner ladder can fetch it.
   * Derived from the graphile task the row sits on, not from the payload.
   *
   * OPTIONAL on purpose, and it must stay that way. During a rolling restart a
   * client can still be holding a live-state payload produced by a backend from
   * before hold classes existed; making this required would fail that parse and
   * blank the Debug → Queue pane for the length of the deploy.
   */
  hold: HoldClassSchema.optional(),
  input: z.unknown(),
  state: JobStateSchema,
  attempts: z.number(),
  maxAttempts: z.number(),
  runAt: z.string(),
  lockedAt: z.string().nullable(),
  lockedBy: z.string().nullable(),
  // Exact worker liveness for a `running` row: `true` = a worker still holds the
  // job's session-scoped advisory lock, `false` = nobody does (the owning backend
  // died, or dispatch is mid-acquisition). `null` for every non-running row,
  // where the question is meaningless. Never derive this from how long
  // `lockedAt` has been set — that inference is the bug this replaced.
  alive: z.boolean().nullable(),
  /**
   * Whether the backend has WRITTEN OFF the slot this run is holding: it passed
   * its hold class's deadline, ignored the abort, and outlived the zombie
   * grace. `alive && forfeited` is the wedge — the handler is still running and
   * nobody is waiting for it any more.
   *
   * OPTIONAL for the same reason `hold` is, and it must stay that way: during a
   * rolling restart a client can still hold a payload produced by a backend
   * from before forfeit existed, and making this required would fail that parse
   * and blank the Debug → Queue pane for the length of the deploy.
   */
  forfeited: z.boolean().optional(),
  queueName: z.string().nullable(),
  priority: z.number(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JobRow = z.infer<typeof JobRowSchema>;

export const JobsPayloadSchema = z.object({
  rows: z.array(JobRowSchema),
  counts: z.object({
    pending: z.number(),
    running: z.number(),
    retrying: z.number(),
    dead: z.number(),
  }),
});
export type JobsPayload = z.infer<typeof JobsPayloadSchema>;

export const jobsListResource = resourceDescriptor<JobsPayload>(
  "jobs-list",
  JobsPayloadSchema,
  { rows: [], counts: { pending: 0, running: 0, retrying: 0, dead: 0 } },
);

// ─── Dead-letter archive (see server/internal/dead-job-gc.ts) ──────────────

export const DeadJobRowSchema = z.object({
  id: z.string(),
  jobName: z.string(),
  input: z.unknown(),
  attempts: z.number(),
  maxAttempts: z.number(),
  lastError: z.string().nullable(),
  diedAt: z.string().nullable(),
  archivedAt: z.string(),
});
export type DeadJobRow = z.infer<typeof DeadJobRowSchema>;

export const DeadJobsPayloadSchema = z.object({
  rows: z.array(DeadJobRowSchema),
});
export type DeadJobsPayload = z.infer<typeof DeadJobsPayloadSchema>;

// No poll — the dead-job GC notifies this resource after each reconcile.
export const deadJobsResource = resourceDescriptor<DeadJobsPayload>(
  "dead-jobs",
  DeadJobsPayloadSchema,
  { rows: [] },
);
