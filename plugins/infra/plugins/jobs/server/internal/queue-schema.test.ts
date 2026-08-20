/**
 * Real-DB regression suite for the one claim this file exists to keep true:
 * **a database that has never hosted a booted backend cannot accept a
 * transactional enqueue, and `installQueueSchema` is the one call that fixes
 * that.**
 *
 * That gap is not hypothetical. A worktree database is forked WITHOUT the queue
 * schema on purpose (`ExcludeSchemaFromFork` in `../index.ts`), and until the
 * installer existed the only thing that put it back was a side effect of
 * `makeWorkerUtils` — reached from the non-transactional enqueue path and from
 * `startWorkers()`, and from nowhere else. So in a fresh worktree where
 * `./singularity test` ran before `./singularity build`, every `{ tx }` enqueue
 * failed with a bare Postgres `3F000` naming nothing in this repo — which four
 * tasks-core tests hit and a filed report mis-diagnosed as a fixture gap.
 *
 * Both arms run against a throwaway database (`db-test-fixture`), and the app's
 * migration chain is deliberately NOT run: the queue schema is graphile's own
 * and independent of ours, so a database with zero app tables is exactly the
 * right substrate for proving one call makes it enqueue-capable.
 *
 * Run: `./singularity test plugins/infra/plugins/jobs`
 * (requires the running embedded cluster — `./singularity build` first).
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  createTestDb,
  type TestDb,
} from "@plugins/database/plugins/db-test-fixture/server";
import { taskFor } from "../../core/hold";
import { installQueueSchema, QueueSchemaMissingError } from "./queue-schema";
import { defineJob } from "./registry";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb({ prefix: "queue_schema_test" });
});

afterAll(async () => {
  await t.drop();
});

/**
 * Await `p` and return the Error it rejected with; throw if it resolved.
 * `expect(p).rejects.toThrow()` is typed `void` under bun:test (see
 * `clusters.test.ts`'s identical helper), so this asserts the rejection for
 * real and hands back the error to pin its class.
 */
async function rejection(p: Promise<unknown>): Promise<Error> {
  try {
    await p;
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected the promise to reject, but it resolved");
}

/**
 * A job defined but deliberately never `register()`ed — registration is a
 * separate step, and `enqueue` does not read the registry (graphile resolves
 * the handler at pickup time, which only starts in `onReady`). Nothing in this
 * process runs a worker, so `run` is never dispatched; it throws to make that
 * loud if the assumption ever stops holding.
 */
const job = defineJob({
  name: "jobs.queue-schema-test",
  hold: "instant",
  dedup: "none",
  input: z.object({ marker: z.string() }),
  event: z.never(),
  run: () => {
    throw new Error(
      "[jobs] queue-schema-test job was dispatched; this suite starts no worker",
    );
  },
});

describe("installQueueSchema", () => {
  test("without it, a transactional enqueue fails as QueueSchemaMissingError", async () => {
    const err = await rejection(
      t.db.transaction((tx) => job.enqueue({ marker: "before" }, { tx })),
    );
    // By INSTANCE, never by message text: the message is prose meant for a
    // human and is free to change, and `jobs:no-raw-addjob` forbids this file
    // from spelling the SQL function whose absence produced it anyway.
    expect(err).toBeInstanceOf(QueueSchemaMissingError);
  });

  test("after it, the same enqueue lands a row on the throwaway database", async () => {
    await installQueueSchema(t.connectionString);

    const { jobId } = await t.db.transaction((tx) =>
      job.enqueue({ marker: "after" }, { tx }),
    );
    expect(jobId).toMatch(/^\d+$/);

    // Read the row back through graphile's own `jobs` view — the queue is a
    // real queue now, not just a schema that exists.
    const res = await t.db.execute<{ id: string; task_identifier: string }>(
      sql`SELECT id::text AS id, task_identifier
          FROM graphile_worker.jobs
          WHERE id = ${jobId}::bigint`,
    );
    expect(res.rows[0]?.id).toBe(jobId);
    // The row sits on the hold class's OWN task (`taskFor(job.hold)`), not the
    // legacy widest-tier one — so this also witnesses that the tx transport is
    // still deriving its columns from the job's spec. Read through `taskFor`
    // rather than spelled out: `core/hold.ts` is the one file allowed to spell
    // a graphile task identifier.
    expect(res.rows[0]?.task_identifier).toBe(taskFor("instant"));
  });

  test("is idempotent — a second install leaves the queue usable", async () => {
    await installQueueSchema(t.connectionString);

    const { jobId } = await t.db.transaction((tx) =>
      job.enqueue({ marker: "again" }, { tx }),
    );
    expect(jobId).toMatch(/^\d+$/);
  });
});
