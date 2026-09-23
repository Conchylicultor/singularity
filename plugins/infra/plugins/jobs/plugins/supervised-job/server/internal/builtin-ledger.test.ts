/**
 * The built-in ledger: kind-id derivation, the failure-policy table, and the
 * claim lock against a real Postgres seeded with the real migration chain.
 *
 * Run: `./singularity test plugins/infra/plugins/jobs/plugins/supervised-job`
 * (the DB half requires the running embedded cluster — `./singularity build`
 * first, which is also what generates the `supervised_job_runs` migration).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  isNonRetryableError,
  NonRetryableError,
} from "@plugins/infra/plugins/jobs/server";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server/testing";
import { runMigrations } from "@plugins/database/plugins/migrations/server";
import type { LogChannel } from "@plugins/primitives/plugins/log-channels/server";
import { HARD_KILL_EXIT_CODE, type RunTerminal } from "../../core";
import {
  applyFailurePolicy,
  builtinKindIdFor,
  builtinLedgerFor,
  isInflightViolation,
  JOB_WIDE_LOCK_KEY,
  readRecordedFailure,
  recordRunError,
} from "./builtin-ledger";
import { defineSupervisedJob } from "./define-supervised-job";
import { _supervisedJobRuns } from "./tables";

const ended = (
  exitCode: number,
  signalCode: string | null = null,
): RunTerminal => ({
  exitCode,
  signalCode,
  finishedAt: new Date("2026-09-16T00:00:00Z"),
});

describe("builtinKindIdFor", () => {
  test("strips separators and lowercases", () => {
    expect(builtinKindIdFor("database.fork")).toBe("databasefork");
    expect(builtinKindIdFor("worktree-cleanup.reap-stale")).toBe(
      "worktreecleanupreapstale",
    );
  });

  test("a name that cannot become a kind id throws", () => {
    expect(() => builtinKindIdFor("1password.sync")).toThrow(/invalid kind id/);
    expect(() => builtinKindIdFor("..")).toThrow(/invalid kind id/);
  });

  test("defineSupervisedJob derives the kind id for a job with no ledger", () => {
    const job = defineSupervisedJob({
      name: "supervised-job.test.derived-kind",
      input: z.object({}),
      channel: { publishAll: () => {} } as unknown as LogChannel,
      argv: () => ({ argv: ["true"] }),
    });
    expect(job.kind.id).toBe("supervisedjobtestderivedkind");
  });
});

describe("isInflightViolation", () => {
  test("only a 23505 on the in-flight index counts", () => {
    expect(
      isInflightViolation({
        code: "23505",
        constraint: "supervised_job_runs_inflight_uniq",
      }),
    ).toBe(true);
    expect(
      isInflightViolation({
        code: "23505",
        constraint: "supervised_job_runs_pkey",
      }),
    ).toBe(false);
    expect(isInflightViolation({ code: "23503" })).toBe(false);
    expect(isInflightViolation(null)).toBe(false);
  });
});

describe("applyFailurePolicy", () => {
  const base = {
    jobName: "database.fork",
    runId: "r1",
    runAttempts: 3,
  };

  function thrown(fn: () => unknown): Error {
    try {
      fn();
    } catch (err) {
      return err as Error;
    }
    throw new Error("expected a throw");
  }

  test("exit 0 is done, whatever the attempt", () => {
    expect(
      applyFailurePolicy({
        ...base,
        terminal: ended(0),
        attempt: 3,
        failure: null,
      }),
    ).toBe("done");
  });

  test("a retryable failure before the last attempt retries — and again on replay", () => {
    const args = {
      ...base,
      terminal: ended(1),
      attempt: 1,
      failure: { errorMessage: "ECONNRESET", retryable: true },
    };
    expect(applyFailurePolicy(args)).toBe("retry");
    expect(applyFailurePolicy(args)).toBe("retry");
  });

  test("a hard kill records nothing and stays retryable", () => {
    expect(
      applyFailurePolicy({
        ...base,
        terminal: ended(HARD_KILL_EXIT_CODE),
        attempt: 2,
        failure: { errorMessage: null, retryable: null },
      }),
    ).toBe("retry");
  });

  test("a non-retryable failure dead-letters at once, naming the recorded error", () => {
    const err = thrown(() =>
      applyFailurePolicy({
        ...base,
        terminal: ended(1),
        attempt: 1,
        failure: { errorMessage: "plan refused", retryable: false },
      }),
    );
    expect(isNonRetryableError(err)).toBe(true);
    expect(err.message).toContain("database.fork");
    expect(err.message).toContain("r1");
    expect(err.message).toContain("exited 1");
    expect(err.message).toContain("plan refused");
  });

  test("the last attempt dead-letters; with nothing recorded it points at the transcript", () => {
    const err = thrown(() =>
      applyFailurePolicy({
        ...base,
        terminal: ended(143, "TERM"),
        attempt: 3,
        failure: { errorMessage: null, retryable: null },
      }),
    );
    expect(err).toBeInstanceOf(NonRetryableError);
    expect(err.message).toContain("killed by TERM");
    expect(err.message).toContain(
      "killed or crashed before recording an error — see the transcript",
    );
  });
});

describe("the built-in ledger (real DB)", () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb({ prefix: "supervised_job_runs_test" });
    await runMigrations(t.db);
  });

  afterAll(async () => {
    await t.drop();
  });

  test("the claim is a lock per (job, key), released by closeRow", async () => {
    const ledger = builtinLedgerFor("t.lock", t.db);
    const meta = { attempt: 1, workflowRunId: "wf" };

    const a = await ledger.claim({ ...meta, lockKey: "target-a" });
    if (a === null) throw new Error("the first claim must win");
    expect(await ledger.claim({ ...meta, lockKey: "target-a" })).toBeNull();
    // Another key, and the same key under another job, are independent.
    expect(await ledger.claim({ ...meta, lockKey: "target-b" })).not.toBeNull();
    expect(
      await builtinLedgerFor("t.other", t.db).claim({
        ...meta,
        lockKey: "target-a",
      }),
    ).not.toBeNull();

    expect((await ledger.listUnfinished()).map((r) => r.runId)).toContain(a);
    await ledger.closeRow(a, ended(0));
    // Idempotent and first-writer-wins.
    await ledger.closeRow(a, ended(9));
    const [row] = await t.db
      .select()
      .from(_supervisedJobRuns)
      .where(eq(_supervisedJobRuns.id, a));
    expect(row?.exitCode).toBe(0);
    expect((await ledger.listUnfinished()).map((r) => r.runId)).not.toContain(
      a,
    );

    expect(await ledger.claim({ ...meta, lockKey: "target-a" })).not.toBeNull();
  });

  test("no lock means one run of the job at a time", async () => {
    const ledger = builtinLedgerFor("t.joblock", t.db);
    const meta = {
      attempt: 1,
      workflowRunId: "wf",
      lockKey: JOB_WIDE_LOCK_KEY,
    };
    expect(await ledger.claim(meta)).not.toBeNull();
    expect(await ledger.claim(meta)).toBeNull();
  });

  test("the child's recorded error is what the policy reads back", async () => {
    const ledger = builtinLedgerFor("t.error", t.db);
    const runId = await ledger.claim({
      attempt: 1,
      workflowRunId: "wf",
      lockKey: JOB_WIDE_LOCK_KEY,
    });
    if (runId === null) throw new Error("the claim must win");
    await recordRunError(runId, new NonRetryableError("bad plan"), t.db);
    expect(await readRecordedFailure(runId, t.db)).toEqual({
      errorMessage: "bad plan",
      retryable: false,
    });
    await t.db.execute(sql`DELETE FROM supervised_job_runs`);
  });
});
