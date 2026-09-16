import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** The partial unique index the built-in ledger's claiming INSERT contends on. */
export const SUPERVISED_JOB_RUNS_INFLIGHT_UQ =
  "supervised_job_runs_inflight_uniq";

/**
 * The built-in ledger: one row per child a supervised job without its own
 * ledger spawned (`defineSupervisedJob` with no `ledger`).
 *
 * A job that has a domain — build, release, backup, deploy — keeps its own
 * table and its own UI (federation, not a shared table). This is the ledger for
 * the jobs that have none: the stale-worktree reaper, the database fork. Their
 * failure surface is the dead-letter, so the row only has to hold what the
 * failure policy and the reconciler read.
 *
 * No namespace column: the table is excluded from worktree forks
 * (`ExcludeFromFork` in this plugin's server barrel), so every row in a
 * database was claimed by that database's own backend.
 */
export const _supervisedJobRuns = pgTable(
  "supervised_job_runs",
  {
    /** The run id — also the child id, the transcript and marker name. */
    id: text("id").primaryKey(),
    /** The job name (`database.fork`). */
    jobName: text("job_name").notNull(),
    /**
     * What this run excludes: `lock(input)`, or one job-wide constant when the
     * job declared no `lock` (at most one run of the job at a time).
     */
    lockKey: text("lock_key").notNull(),
    /**
     * The child's pid. Seeded with the claiming backend's own pid so the fresh
     * row does not read as an orphan before the child exists.
     */
    pid: integer("pid"),
    /** 1-indexed spawn attempt within its workflow. */
    attempt: integer("attempt").notNull(),
    /** The workflow that owns this run, for attribution. Nothing reads it back. */
    workflowRunId: text("workflow_run_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** Stamped by `closeRow` from the exit marker — the only writer of the outcome. */
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    exitCode: integer("exit_code"),
    signalCode: text("signal_code"),
    /**
     * What the child's `run` body threw, recorded by the child itself before it
     * exits 1. Null for a child killed or crashed before it could record one.
     */
    errorMessage: text("error_message"),
    /**
     * `false` when the body threw a `NonRetryableError`. Null when nothing was
     * recorded — a hard kill or a reboot's TERM carries no flag and stays
     * retryable.
     */
    retryable: boolean("retryable"),
  },
  (t) => [
    // THE lock: the claiming INSERT wins or loses on this index, so there is no
    // check-then-act window between two backends.
    uniqueIndex(SUPERVISED_JOB_RUNS_INFLIGHT_UQ)
      .on(t.jobName, t.lockKey)
      .where(sql`${t.finishedAt} IS NULL`),
    index("supervised_job_runs_job_started_idx").on(
      t.jobName,
      t.startedAt.desc(),
    ),
  ],
);
