import { sql as drizzleSql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { executeRows } from "@plugins/database/plugins/sql-rows/core";
import { defineJob, LEGACY_JOB_TASK } from "@plugins/infra/plugins/jobs/server";
import { fail } from "./queue-probe";

// End-to-end check of the cron path's dedup: repeated ticks of one scheduled job
// collapse onto ONE pending row, and that row's `run_at` does not move.
//
// Both halves are load-bearing and the second is the subtle one. `buildCronItems`
// (jobs/worker.ts) passes `jobKey: \`${job.name}:_\`` with
// `jobKeyMode: "preserve_run_at"`:
//
//   · Without the key, every tick INSERTed a brand-new row forever — 57 copies
//     each of six per-minute monitors by the time main's queue wedged on
//     2026-08-17, the queue-health monitor among them.
//   · Without `preserve_run_at`, graphile's default `"replace"` mode pushes the
//     pending row's `run_at` forward on every tick (`sql/000018.sql:161-164`
//     keeps the original only when `job_key_preserve_run_at` is true and
//     `attempts = 0`). That starves a `* * * * *` job in a merely-busy queue — it
//     is perpetually re-scheduled a minute out and never becomes the oldest ready
//     row — and it resets queue-health's `oldestOverdueMs` to near-zero every
//     minute during a wedge, making the backlog alarm QUIETER than having no
//     dedup at all. The dedup fix and the observability fix only compose in this
//     mode.
//
// ── How this is driven, and what that costs ────────────────────────────────
//
// Not through the real cron scheduler. graphile's cron fires on minute
// boundaries, so observing a pending row survive several ticks unmoved would take
// minutes per run and would need a permanently-installed `* * * * *` schedule
// whose only purpose is this test — real per-minute queue noise in every main
// backend, forever. Instead the two arms below drive `graphile_worker.add_job`
// with the same `job_key` / `job_key_mode` arguments the cron path passes, which
// is what actually decides the outcome: everything asserted here is graphile's
// upsert behaviour under those arguments.
//
// The honest limitation: the key format and the mode are RESTATED here rather
// than read from `buildCronItems`, so if the cron path changed its key or dropped
// `preserve_run_at`, this endpoint would still pass. Closing that needs one
// derivation both sides import — a `cronJobKeyFor(job)` in registry.ts beside
// `queueNameFor`, with worker.ts calling it — which is a change to worker.ts and
// is not made here.
//
// The rows are enqueued an hour out so they stay PENDING for the whole run:
// graphile's collapse-onto-one-row upsert is gated `where jobs.locked_at is null`
// (and clears the key of any row that is not `is_available`), so a row that gets
// fetched mid-test would legitimately be replaced by a new one and there would be
// nothing left to assert.
//
// NOTE: not using implement() — the assertions return raw Response objects.

/** The graphile task the rows below are inserted on. Imported, never spelled: a
 * hand-typed identifier is exactly what `jobs:no-raw-addjob` now forbids, since
 * a job's task is a property of its hold class (`taskFor(job.hold)`) and a bare
 * `jobs.run` puts the row in the widest tier.
 *
 * Which identifier it is happens to be immaterial to what this file asserts —
 * graphile's keyed upsert collapses on `job_key` alone, whatever task the row
 * sits on. The legacy one is used because it is the identifier that is always
 * served by a runner, so a row this harness somehow leaked can still be
 * dispatched rather than stranding on a task nobody fetches. */
const JOB_TASK = LEGACY_JOB_TASK;

const JOB_NAME = "events_test.cron-dedup";

/** Byte-identical to what `buildCronItems` passes and to what `enqueue()` derives
 * for a `dedup: "singleton"` job (`${name}:${"_"}`). Sharing it is the point: a
 * manual enqueue and a cron tick collapse onto the SAME pending row instead of
 * racing as two — which arm B below asserts directly. */
const CRON_JOB_KEY = `${JOB_NAME}:_`;

/** A scheduled job's tick payload: the job name and its default input, no
 * `workflowRunId` (the worker derives that per tick from graphile's `_cron`). */
const CRON_PAYLOAD = JSON.stringify({ jobName: JOB_NAME, input: {} });

const MAX_ATTEMPTS = 5;

/** The job the rows dispatch to. Deliberately NOT scheduled: a real `schedule`
 * here would install a live cron item in every main backend, which is exactly the
 * per-minute noise this endpoint exists to avoid. `dedup: "singleton"` is what
 * makes `enqueue()` derive the same job key the cron path uses. */
export const cronDedupProbe = defineJob({
  name: JOB_NAME,
  hold: "instant",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  run: () => {
    // Nothing to do — every row this endpoint creates is an hour out and removed
    // before it returns. A run means the harness leaked one.
    console.warn(
      `[events-test] ${JOB_NAME} ran — a cron-dedup probe row leaked`,
    );
  },
});

interface KeyedRow {
  id: string;
  runAtMs: number;
  attempts: number;
}

async function readKeyedRows(): Promise<KeyedRow[]> {
  const rows = await executeRows(db, {
    label: "cron-dedup: keyed rows",
    row: z.object({
      // `j.id` is `bigint` and the epoch expression is cast to one; pg hands
      // both back as strings.
      id: z.string(),
      run_at_ms: z.string(),
      attempts: z.number(),
    }),
    query: drizzleSql`
    SELECT j.id::text                                  AS id,
           (extract(epoch FROM j.run_at) * 1000)::bigint AS run_at_ms,
           j.attempts::int                             AS attempts
      FROM graphile_worker._private_jobs j
     WHERE j.key = ${CRON_JOB_KEY}
     ORDER BY j.id
  `,
  });
  return rows.map((r) => ({
    id: r.id,
    runAtMs: Number(r.run_at_ms),
    attempts: r.attempts,
  }));
}

/** One cron-shaped insertion: the arguments `buildCronItems` hands graphile's
 * cron scheduler, minus the scheduler. */
async function cronShapedInsert(runAt: Date): Promise<void> {
  await db.execute(drizzleSql`
    SELECT graphile_worker.add_job(
      identifier   := ${JOB_TASK},
      payload      := ${CRON_PAYLOAD}::json,
      run_at       := ${runAt.toISOString()}::timestamptz,
      max_attempts := ${MAX_ATTEMPTS},
      job_key      := ${CRON_JOB_KEY},
      job_key_mode := 'preserve_run_at'
    )
  `);
}

/** graphile's own removal for a keyed row. Deletes it outright while it is
 * pending, which is the state this endpoint keeps it in throughout. */
async function removeKeyedRow(): Promise<void> {
  await db.execute(drizzleSql`
    SELECT graphile_worker.remove_job(${CRON_JOB_KEY})
  `);
}

export async function handleCronDedup(): Promise<Response> {
  // A row left over from an interrupted earlier run would make every count
  // assertion below read the wrong thing.
  await removeKeyedRow();

  const hour = 60 * 60 * 1000;
  const t1 = new Date(Date.now() + 1 * hour);
  const t2 = new Date(Date.now() + 2 * hour);
  const t3 = new Date(Date.now() + 3 * hour);
  const t4 = new Date(Date.now() + 4 * hour);

  try {
    // ── Arm A: three cron-shaped ticks collapse onto one unmoved row ────────
    await cronShapedInsert(t1);
    const afterFirst = await readKeyedRows();
    const first = afterFirst[0];
    if (afterFirst.length !== 1 || !first) {
      return fail(
        "setup",
        `the first cron-shaped insert produced ${afterFirst.length} rows, expected 1`,
        { rows: afterFirst },
      );
    }
    if (first.runAtMs !== t1.getTime()) {
      return fail(
        "setup",
        "the first row did not take the run_at it was given",
        {
          expected: t1.toISOString(),
          actual: new Date(first.runAtMs).toISOString(),
        },
      );
    }

    await cronShapedInsert(t2);
    await cronShapedInsert(t3);

    const afterTicks = await readKeyedRows();
    if (afterTicks.length !== 1) {
      return fail(
        "dedup",
        `three cron-shaped inserts for one scheduled job produced ${afterTicks.length} pending rows — the cron path is not deduping, so every tick piles up another row forever`,
        { jobKey: CRON_JOB_KEY, rows: afterTicks },
      );
    }
    const collapsed = afterTicks[0];
    if (!collapsed || collapsed.id !== first.id) {
      return fail(
        "dedup",
        "the later ticks replaced the pending row instead of updating it",
        { firstId: first.id, nowId: collapsed?.id ?? null },
      );
    }
    if (collapsed.runAtMs !== t1.getTime()) {
      return fail(
        "preserve-run-at",
        'run_at moved across cron ticks — the cron path is inserting under the default "replace" mode, which starves a per-minute job in a busy queue and resets queue-health\'s oldestOverdueMs to near-zero every tick during a wedge',
        {
          expected: t1.toISOString(),
          actual: new Date(collapsed.runAtMs).toISOString(),
          movedByMs: collapsed.runAtMs - t1.getTime(),
        },
      );
    }

    // ── Arm B: a manual enqueue shares that row, and DOES move run_at ───────
    // Two things at once. The collapse proves the cron key and the key
    // `enqueue()` derives for a singleton are one key space — a manual run and a
    // tick contend for one row rather than racing as two. The move proves arm A's
    // preservation came from `preserve_run_at` and not from graphile ignoring
    // `run_at` on conflict: the ordinary enqueue path uses graphile's default
    // "replace" mode, and here that is visible.
    await cronDedupProbe.enqueue({}, { runAt: t4 });

    const afterEnqueue = await readKeyedRows();
    if (afterEnqueue.length !== 1) {
      return fail(
        "shared-key",
        `a manual enqueue of the same singleton job produced ${afterEnqueue.length} rows — it is not sharing the cron path's job key`,
        { jobKey: CRON_JOB_KEY, rows: afterEnqueue },
      );
    }
    const merged = afterEnqueue[0];
    if (!merged || merged.id !== first.id) {
      return fail(
        "shared-key",
        "a manual enqueue replaced the cron row instead of collapsing onto it",
        { firstId: first.id, nowId: merged?.id ?? null },
      );
    }
    if (merged.runAtMs !== t4.getTime()) {
      return fail(
        "shared-key",
        "the manual enqueue did not move run_at — arm A's preservation cannot be attributed to preserve_run_at if the replace path does not move it either",
        {
          expected: t4.toISOString(),
          actual: new Date(merged.runAtMs).toISOString(),
        },
      );
    }

    return Response.json({
      ok: true,
      jobKey: CRON_JOB_KEY,
      rowId: first.id,
      cronTicks: [t1, t2, t3].map((d) => d.toISOString()),
      runAtAfterCronTicks: new Date(collapsed.runAtMs).toISOString(),
      runAtAfterManualEnqueue: new Date(merged.runAtMs).toISOString(),
    });
  } finally {
    // The row is an hour out, so nothing would have run it — but leaving it would
    // break the next invocation's counts and eventually fire a stray job.
    await removeKeyedRow();
  }
}
