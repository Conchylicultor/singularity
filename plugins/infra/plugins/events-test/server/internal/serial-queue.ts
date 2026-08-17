import { randomUUID } from "node:crypto";
import { fixed, retryUntil } from "@plugins/packages/plugins/retry/core";
import { fail, pause, readSerialRows } from "./queue-probe";
import {
  releaseAllGates,
  releaseGate,
  resetSerialLane,
  serialProbe,
  serialRunLog,
} from "./serial-job";

// End-to-end check that `defineJob({ serial })` serializes at FETCH time.
//
// Four jobs sharing one serialization lane are enqueued at once and the first is
// held open. The assertions are about the other three:
//
//   1. QUEUE CARRIED — every row has `job_queue_id IS NOT NULL`, and all four
//      share ONE queue. A row that lands with a null queue is fetched regardless
//      of who else is running: the serialization silently evaporates for that
//      path, with no type error and no symptom until two of them overlap. (Rows
//      landing in FOUR different queues would be the other failure — a queue name
//      derived from the input rather than the resource, which graphile's own
//      benchmark calls pathological.)
//   2. AT MOST ONE LOCKED — sampled repeatedly while the first run is held.
//   3. THE OTHER THREE ARE NOT LOCKED AT ALL — `locked_at IS NULL`, i.e. they
//      were never fetched, so they occupy no worker slot while they wait.
//
// (3) is the assertion that matters, and it is the whole difference between this
// design and the in-process semaphore it replaced. A `createSemaphore(1)` is
// entered AFTER graphile hands the job to a worker, so three jobs waiting on it
// are three rows with `locked_at` set, each holding a slot to do nothing. That is
// literally how main's queue died on 2026-08-17: one wedged
// `prototypes.render-thumbnail` turned the next two renders into two more stuck
// slots, three of the four in the pool, and 690 jobs piled up behind them. Under
// `serial`, graphile's fetch query refuses a row whose queue is busy
// (`dist/sql/getJob.js:72-74`, `job_queues.is_available = true`), so waiting is
// free and a wedged serialized job costs exactly one slot forever.
//
// Then (4) PROGRESSION — releasing the held run must hand the queue to the next
// job. A serialization that never lets go is a wedge, not a guarantee.
//
// NOTE: not using implement() — the assertions return raw Response objects, same
// as the crash-recovery harness next door.

const JOB_COUNT = 4;
// Sampled while the first run is held, so "one at a time" is an observation
// repeated over a window rather than a single lucky instant.
const SETTLE_SAMPLES = 5;
const SAMPLE_INTERVAL_MS = 100;

interface Sample {
  lockedLabels: string[];
  unlockedCount: number;
}

export async function handleSerialQueue(): Promise<Response> {
  resetSerialLane();
  const run = `serial-${randomUUID()}`;
  const labels = Array.from({ length: JOB_COUNT }, (_, i) => `${run}#${i + 1}`);

  try {
    // Enqueued one at a time so row ids — and therefore graphile's fetch order
    // (`order by priority asc, run_at asc`) — follow the label order.
    for (const label of labels) {
      await serialProbe.enqueue({ run, label, hold: true });
    }

    // ── 1. The queue is carried by the enqueue path ─────────────────────────
    const enqueued = await readSerialRows(run);
    if (enqueued.length !== JOB_COUNT) {
      return fail(
        "setup",
        `expected ${JOB_COUNT} enqueued rows, found ${enqueued.length}`,
        { rows: enqueued },
      );
    }
    const unqueued = enqueued.filter((r) => r.queueId === null);
    if (unqueued.length > 0) {
      return fail(
        "queue-carried",
        `${unqueued.length} enqueued row(s) have job_queue_id IS NULL — this enqueue path dropped the job's serialization queue, so those rows are fetched regardless of who else is running`,
        { rows: unqueued },
      );
    }
    const queueIds = [...new Set(enqueued.map((r) => r.queueId))];
    if (queueIds.length !== 1) {
      return fail(
        "queue-carried",
        `the ${JOB_COUNT} rows landed in ${queueIds.length} different queues — the queue name is varying per job instance instead of naming the shared resource`,
        { queueIds, rows: enqueued },
      );
    }
    const queueName = enqueued[0]?.queueName ?? null;

    // ── 2 & 3. One locked, the rest never fetched ───────────────────────────
    const started = await retryUntil(
      async () => {
        const rows = await readSerialRows(run);
        return rows.some((r) => r.locked) ? rows : null;
      },
      { delay: fixed(50), deadline: 10_000, onDeadline: () => null },
    );
    if (!started) {
      return fail(
        "dispatch",
        "no job in the serial queue was picked up within 10s — the queue is not draining at all",
        { rows: await readSerialRows(run) },
      );
    }

    const samples: Sample[] = [];
    for (let i = 0; i < SETTLE_SAMPLES; i++) {
      // One statement, so "how many are locked right now" is a single atomic
      // observation rather than four reads that could straddle a fetch.
      const rows = await readSerialRows(run);
      const lockedLabels = rows.filter((r) => r.locked).map((r) => r.label);
      const unlockedCount = rows.filter((r) => !r.locked).length;
      samples.push({ lockedLabels, unlockedCount });

      if (lockedLabels.length > 1) {
        return fail(
          "serialization",
          `${lockedLabels.length} jobs sharing one serial queue were locked at the same instant — the queue is not serializing`,
          { sample: i, lockedLabels, rows },
        );
      }
      if (rows.length !== JOB_COUNT) {
        return fail(
          "serialization",
          `expected all ${JOB_COUNT} rows to still exist while the first run is held, found ${rows.length}`,
          { sample: i, rows },
        );
      }
      if (lockedLabels.length !== 1) {
        return fail(
          "serialization",
          "the held run stopped being locked while its gate was still shut",
          { sample: i, rows },
        );
      }
      // The assertion that matters: the other three were never fetched, so they
      // hold no worker slot.
      if (unlockedCount !== JOB_COUNT - 1) {
        return fail(
          "slots-free",
          `${JOB_COUNT - 1 - unlockedCount} of the waiting jobs have locked_at set — they were fetched into worker slots to wait, which is exactly the slot amplification serial exists to prevent`,
          { sample: i, rows },
        );
      }
      await pause(SAMPLE_INTERVAL_MS);
    }

    const firstSample = samples[0];
    const heldLabel = firstSample?.lockedLabels[0];
    if (!heldLabel) {
      return fail("serialization", "no held label observed", { samples });
    }

    // ── 4. Releasing the held run hands the queue to the next job ───────────
    releaseGate(heldLabel);
    const progressed = await retryUntil(
      async () => {
        const rows = await readSerialRows(run);
        // Wait for the released run's row to be gone (graphile deletes it on
        // success and clears the queue lock in the same statement) before
        // reading who is next.
        if (rows.some((r) => r.label === heldLabel)) return null;
        const lockedLabels = rows.filter((r) => r.locked).map((r) => r.label);
        return lockedLabels.length > 0 ? { lockedLabels, rows } : null;
      },
      { delay: fixed(50), deadline: 10_000, onDeadline: () => null },
    );
    if (!progressed) {
      return fail(
        "progression",
        "after the held run completed, no waiting job became locked within 10s — the queue lock was never handed on",
        { heldLabel, rows: await readSerialRows(run) },
      );
    }
    if (progressed.lockedLabels.length !== 1) {
      return fail(
        "progression",
        `${progressed.lockedLabels.length} jobs became locked once the queue freed — serialization held only while the queue was busy`,
        { heldLabel, lockedLabels: progressed.lockedLabels },
      );
    }

    // ── Drain, so the harness leaves nothing behind ─────────────────────────
    releaseAllGates();
    const drained = await retryUntil(
      async () => {
        const rows = await readSerialRows(run);
        return rows.length === 0 ? true : null;
      },
      { delay: fixed(100), deadline: 20_000, onDeadline: () => false },
    );
    if (!drained) {
      return fail("drain", "the serial queue did not drain within 20s", {
        rows: await readSerialRows(run),
      });
    }

    const mine = serialRunLog.filter((e) => e.run === run);
    const expired = mine.filter((e) => e.phase === "gate-expired");
    if (expired.length > 0) {
      return fail(
        "drain",
        "a run hit its gate cap instead of being released — the harness leaked a gate",
        { expired },
      );
    }
    const finished = mine.filter((e) => e.phase === "finished");
    if (finished.length !== JOB_COUNT) {
      return fail(
        "drain",
        `expected ${JOB_COUNT} finished runs, saw ${finished.length}`,
        { log: mine },
      );
    }

    return Response.json({
      ok: true,
      run,
      queueName,
      samples,
      nextAfterRelease: progressed.lockedLabels[0],
      finishedOrder: finished.map((e) => e.label),
    });
  } finally {
    // Every early return above leaves a handler blocked on its gate, holding
    // this lane's queue lock. Nothing else in the app shares the lane, so the
    // blast radius is the harness itself — but a test that wedges the queue it
    // is testing is not a test.
    releaseAllGates();
  }
}
