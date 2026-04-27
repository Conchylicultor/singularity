import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

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
    // `result` is wrapped `{ v: <result> }` so `null` round-trips cleanly.
    resultJson: jsonb("result_json").$type<{ v: unknown } | null>(),
    // Set when the step threw; replays re-throw the recorded message.
    errorMessage: text("error_message"),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.workflowRunId, t.stepName] })],
);

// Wait log for durable workflows — tracks each `ctx.waitFor(event, ...)` call
// site. `pending` until either the event fires (→ resolved) or the timeout
// expires (→ timed_out). Payload from the event is stored so replay-after-
// resume can return it without re-running the trigger subscription.
export const _jobWaits = pgTable(
  "job_waits",
  {
    workflowRunId: text("workflow_run_id").notNull(),
    waitName: text("wait_name").notNull(),
    status: text("status")
      .$type<"pending" | "resolved" | "timed_out">()
      .notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown> | null>(),
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
