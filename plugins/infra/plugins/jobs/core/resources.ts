import { z } from "zod";
import { liveCollection, liveValue } from "@plugins/network/plugins/live/core";
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

/**
 * Debug → Queue's Jobs tab: the newest 500 graphile job rows, with their
 * per-state counts. Served external (`server/internal/resources.ts`): graphile's
 * tables sit outside the schema the change feed covers.
 *
 * `load: "on-demand"`: a 500-row join read by one Debug pane is kept out of the
 * shared flush — a change sends an `invalidate`, and each open tab refetches
 * over HTTP. No placeholder: not loaded yet is `pending`, never an empty queue.
 */
export const jobsList = liveValue("jobs-list", {
  schema: JobsPayloadSchema,
  load: "on-demand",
});

// ─── Dead-letter archive (see server/internal/dead-job-gc.ts) ──────────────

// One archived row of `dead_jobs`, field for column: the `deadJobs` collection
// binds each field to its column by name. The two timestamps are coerced Dates
// — a `timestamp` column reads back as a `Date` through drizzle's query
// builder, and crosses the wire as an ISO string.
export const DeadJobRowSchema = z.object({
  id: z.string(),
  jobName: z.string(),
  input: z.unknown(),
  attempts: z.number(),
  maxAttempts: z.number(),
  lastError: z.string().nullable(),
  diedAt: z.coerce.date().nullable(),
  archivedAt: z.coerce.date(),
});
export type DeadJobRow = z.infer<typeof DeadJobRowSchema>;

// The `GET /api/jobs/dead` endpoint's body. The live collection below carries
// the bare rows.
export const DeadJobsPayloadSchema = z.object({
  rows: z.array(DeadJobRowSchema),
});
export type DeadJobsPayload = z.infer<typeof DeadJobsPayloadSchema>;

/**
 * How many rows the dead-letter archive keeps: the dead-job GC trims
 * `dead_jobs` to the newest this-many on every reconcile
 * (`server/internal/dead-job-gc.ts`), and a window of the `deadJobs`
 * collection grows to at most the same — so a fully grown window is the whole
 * archive.
 */
export const DEAD_JOBS_ARCHIVE_CAP = 2000;

/**
 * Debug → Queue's Dead tab: the dead-letter archive as a live collection — a
 * bounded window, newest archived first (200, grown to at most
 * `DEAD_JOBS_ARCHIVE_CAP`), plus its `:rows` / `:groups` siblings. Nothing
 * filters it yet (`filterable: {}`). No poll and no notify: `dead_jobs` is a
 * public table, so the change feed moves every subscribed window when the
 * dead-job GC archives or purges.
 */
export const deadJobs = liveCollection("dead-jobs", {
  row: DeadJobRowSchema,
  id: "id",
  filterable: {},
  sortable: ["archivedAt"],
  default: { orderBy: [["archivedAt", "desc"]], limit: 200 },
  maxLimit: DEAD_JOBS_ARCHIVE_CAP,
});
