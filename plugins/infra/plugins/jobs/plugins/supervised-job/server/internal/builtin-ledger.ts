import { and, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db } from "@plugins/database/server";
import {
  isNonRetryableError,
  NonRetryableError,
} from "@plugins/infra/plugins/jobs/server";
import { assertRunKindId, type RunTerminal } from "../../core";
import type { UnfinishedRun } from "./run/registry";
import { _supervisedJobRuns, SUPERVISED_JOB_RUNS_INFLIGHT_UQ } from "./tables";

/**
 * The lock key of a job that declared no `lock`: every run of the job contends
 * on this one value, so at most one runs at a time. A constant rather than the
 * run id, because "no lock" on a reaper means "don't sweep twice at once", not
 * "no exclusion at all".
 */
export const JOB_WIDE_LOCK_KEY = "*";

/**
 * The supervised-run kind id of a built-in-ledger job, derived from its name:
 * `database.fork` → `databasefork`, `worktree-cleanup.reap-stale` →
 * `worktreecleanupreapstale`.
 *
 * Asserted rather than trusted — a kind id is a filename prefix, so it must be
 * lowercase alphanumeric starting with a letter. A name that derives to
 * something else (`1password.sync`) throws at definition, and two names that
 * derive to the same id throw at register (the kind registry refuses a
 * duplicate id).
 */
export function builtinKindIdFor(jobName: string): string {
  const id = jobName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  assertRunKindId(id);
  return id;
}

/**
 * node-postgres surfaces a unique violation as SQLSTATE 23505 plus the
 * offending constraint. The constraint is checked, not just the code: a
 * primary-key collision reported as "already running" would be a
 * plausible-looking lie about a different fault.
 */
export function isInflightViolation(err: unknown): boolean {
  const pg = err as { code?: string; constraint?: string } | null;
  return (
    pg?.code === "23505" && pg.constraint === SUPERVISED_JOB_RUNS_INFLIGHT_UQ
  );
}

/**
 * The built-in ledger's verbs, bound to one job. Every verb takes the database
 * handle at construction so the claim lock can be driven against a throwaway
 * database in a test.
 */
export function builtinLedgerFor(
  jobName: string,
  conn: NodePgDatabase = db,
): {
  claim(meta: {
    lockKey: string;
    attempt: number;
    workflowRunId: string;
  }): Promise<string | null>;
  listUnfinished(): Promise<readonly UnfinishedRun[]>;
  setPid(runId: string, pid: number): Promise<void>;
  closeRow(runId: string, terminal: RunTerminal): Promise<void>;
} {
  return {
    /**
     * INSERT the row; the partial unique index answers the race. Seeded with
     * this backend's pid so the fresh row is not an orphan before the child's
     * pid is known.
     */
    async claim({ lockKey, attempt, workflowRunId }) {
      const runId = crypto.randomUUID();
      try {
        await conn.insert(_supervisedJobRuns).values({
          id: runId,
          jobName,
          lockKey,
          pid: process.pid,
          attempt,
          workflowRunId,
        });
        return runId;
      } catch (err) {
        if (isInflightViolation(err)) return null;
        throw err;
      }
    },

    async listUnfinished() {
      const rows = await conn
        .select({ id: _supervisedJobRuns.id, pid: _supervisedJobRuns.pid })
        .from(_supervisedJobRuns)
        .where(
          and(
            eq(_supervisedJobRuns.jobName, jobName),
            isNull(_supervisedJobRuns.finishedAt),
          ),
        );
      return rows.map((row) => ({ runId: row.id, pid: row.pid }));
    },

    async setPid(runId, pid) {
      await conn
        .update(_supervisedJobRuns)
        .set({ pid })
        .where(eq(_supervisedJobRuns.id, runId));
    },

    /** Bare, idempotent, first-writer-wins: the only writer of the outcome. */
    async closeRow(runId, terminal) {
      await conn
        .update(_supervisedJobRuns)
        .set({
          finishedAt: terminal.finishedAt,
          exitCode: terminal.exitCode,
          signalCode: terminal.signalCode,
        })
        .where(
          and(
            eq(_supervisedJobRuns.id, runId),
            isNull(_supervisedJobRuns.finishedAt),
          ),
        );
    },
  };
}

/**
 * Record, from the CHILD, why its `run` body threw — before it exits 1.
 *
 * `retryable` is the one bit the parent's failure policy cannot recover from an
 * exit code: whether the body declared the failure deterministic.
 */
export async function recordRunError(
  runId: string,
  err: unknown,
  conn: NodePgDatabase = db,
): Promise<void> {
  await conn
    .update(_supervisedJobRuns)
    .set({
      errorMessage: err instanceof Error ? err.message : String(err),
      retryable: !isNonRetryableError(err),
    })
    .where(eq(_supervisedJobRuns.id, runId));
}

/** What the failure policy reads back off a failed run's row. */
export interface RecordedFailure {
  readonly errorMessage: string | null;
  readonly retryable: boolean | null;
}

export async function readRecordedFailure(
  runId: string,
  conn: NodePgDatabase = db,
): Promise<RecordedFailure> {
  const [row] = await conn
    .select({
      errorMessage: _supervisedJobRuns.errorMessage,
      retryable: _supervisedJobRuns.retryable,
    })
    .from(_supervisedJobRuns)
    .where(eq(_supervisedJobRuns.id, runId));
  if (row === undefined) {
    // The claim inserted this row and only the 30-day retention deletes, so a
    // missing row for a run that just ended is a real fault.
    throw new Error(
      `[supervised-job] run ${runId} ended but has no supervised_job_runs row.`,
    );
  }
  return row;
}

/**
 * The built-in ledger's failure policy — the dead-letter is its failure
 * surface, since a job without its own ledger has no UI.
 *
 * - exit 0 → `done`.
 * - failed, and (not retryable, or the last attempt) → throw
 *   `NonRetryableError` naming the job, the run, how it ended, and the child's
 *   recorded error (or that it recorded none).
 * - failed otherwise → `retry`.
 *
 * Pure over what it is handed, so it is deterministic on replay: `onEnded` is
 * not memoized and re-runs for every earlier attempt, and an earlier attempt
 * that answered `retry` the first time answers `retry` again (its row and its
 * attempt number have not changed).
 */
export function applyFailurePolicy(args: {
  jobName: string;
  runId: string;
  terminal: RunTerminal;
  attempt: number;
  runAttempts: number;
  failure: RecordedFailure | null;
}): "done" | "retry" {
  const { terminal } = args;
  if (terminal.exitCode === 0) return "done";
  if (args.failure === null) {
    throw new Error(
      `[supervised-job] ${args.jobName}: a failed run's policy needs its recorded failure.`,
    );
  }
  const last = args.attempt >= args.runAttempts;
  if (args.failure.retryable !== false && !last) return "retry";
  const ended =
    terminal.signalCode !== null
      ? `was killed by ${terminal.signalCode} (exit ${terminal.exitCode})`
      : `exited ${terminal.exitCode}`;
  const why =
    args.failure.errorMessage ??
    "killed or crashed before recording an error — see the transcript";
  throw new NonRetryableError(
    `[supervised-job] ${args.jobName}: run ${args.runId} ${ended} on attempt ` +
      `${args.attempt}/${args.runAttempts}` +
      `${args.failure.retryable === false ? " (not retryable)" : ""}: ${why}`,
  );
}
