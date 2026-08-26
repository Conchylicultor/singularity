import { z } from "zod";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import {
  parsedJson,
  parsedText,
} from "@plugins/database/plugins/sql-column/server";

// Step log for durable workflows — memoizes side-effects performed via
// `ctx.step(name, fn)` so replays (retries or resumes after a suspend) skip
// previously-completed work. Row is keyed by (workflowRunId, stepName); the
// name must be unique per handler. Rows for a workflow are deleted on normal
// completion (see worker cleanup).
export const _jobSteps = pgTable(
  "job_steps",
  {
    workflowRunId: text("workflow_run_id").notNull(),
    stepName: text("step_name").notNull(),
    // JSONB so a step that returns `undefined` distinguishes from "not run".
    // `result` is wrapped `{ v: <result> }` so `null` round-trips cleanly — and
    // the box is exactly what the decoder verifies. What is INSIDE it is a step
    // handler's arbitrary return value, so `v` stays `z.unknown()`: the schema
    // claims the wrapper and nothing else, which is all this column ever knew.
    resultJson: parsedJson("result_json", z.object({ v: z.unknown() })),
    // Set when the step threw; replays re-throw the recorded message.
    errorMessage: text("error_message"),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.workflowRunId, t.stepName] })],
);

// The wait lifecycle, written once: this schema IS the `status` column's decoder
// and the source of its declared type, so the two cannot drift. Strict rather
// than tolerant — the durable workflow engine is the only writer and has never
// renamed a state, so an unknown value is a bug and should be loud.
const JobWaitStatusSchema = z.enum([
  "pending",
  "resolved",
  "timed_out",
  "cancelled",
]);

// Wait log for durable workflows — tracks each `ctx.waitFor(event, ...)` call
// site. `pending` until either the event fires (→ resolved) or the timeout
// expires (→ timed_out). Payload from the event is stored so replay-after-
// resume can return it without re-running the trigger subscription.
export const _jobWaits = pgTable(
  "job_waits",
  {
    workflowRunId: text("workflow_run_id").notNull(),
    waitName: text("wait_name").notNull(),
    status: parsedText("status", JobWaitStatusSchema).notNull(),
    // Whatever event fired — `waitFor<T>` is generic per call site, so the only
    // claim the column can make is the one `Record<string, unknown>` made and
    // nothing checked: a non-null object. `z.record` keeps every key of it.
    payloadJson: parsedJson("payload_json", z.record(z.string(), z.unknown())),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.workflowRunId, t.waitName] }),
    index("job_waits_status_idx").on(t.status),
  ],
);

// Durable archive of permanently-failed graphile jobs. The graphile queue has
// no GC for jobs that exhausted `max_attempts`, so they accumulate forever in
// every worktree's `_private_jobs`. `reconcileDeadJobs` copies dead rows here
// (idempotently — PK is the original graphile job id), purges them from the
// queue, and bounds this table by TTL + cap. Surfaced in Debug → Queue → Dead.
export const _deadJobs = pgTable(
  "dead_jobs",
  {
    // Original graphile job id — PK makes the archive INSERT idempotent.
    id: text("id").primaryKey(),
    jobName: text("job_name").notNull(),
    // The dead job's original enqueue input — one shape per job type, so this
    // column declares `unknown` and means it. A decoder would have nothing to
    // verify, and every reader already treats it as `unknown`.
    input: jsonb("input"),
    attempts: integer("attempts").notNull(),
    maxAttempts: integer("max_attempts").notNull(),
    lastError: text("last_error"),
    diedAt: timestamp("died_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("dead_jobs_archived_at_idx").on(t.archivedAt)],
);
