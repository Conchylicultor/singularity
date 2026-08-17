import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";

// The job the two queue-level regression endpoints drive, plus the gate that
// lets a test decide when one of its runs finishes.
//
// A serialization test needs one thing an ordinary job cannot give it: a run
// that is *definitely still running* while the test looks at the queue. Sleeping
// for a fixed duration would race (too short and the queue is already free; too
// long and every failure costs that duration), so the handler instead blocks on
// a gate the test opens by hand. While it blocks, the lane's queue row stays
// locked — which is precisely the condition both endpoints are about.
//
// Every gate is bounded. A test that returns early without opening its gate
// would otherwise hold this lane's queue lock for the life of the process, which
// for a harness verifying "one stuck job must not wedge anything" would be a
// spectacular own goal. So the wait is capped, the expiry is recorded in the run
// log (the test asserts it did NOT happen), and every endpoint opens all its
// gates in a `finally`.

/** The lane every serialized job in this plugin shares.
 *
 * A lane name must come from a small fixed set and name a RESOURCE, never an
 * input — graphile's fetch strategy degrades badly with per-instance queue names
 * (see `SerialSpec` in jobs/registry.ts). Here the "resource" is this test
 * plugin's own lane: one place for the harness to serialize against itself, and
 * nothing in the app shares it. */
export const SERIAL_LANE = "events-test";

/** How long a held run waits before giving up on its gate. Long enough that no
 * healthy test ever reaches it, short enough that a leaked gate frees the lane
 * on its own. */
const GATE_CAP_MS = 20_000;

export interface SerialRunEntry {
  /** The test invocation this run belongs to; every endpoint uses a fresh one so
   * two concurrent runs of the harness cannot read each other's rows. */
  run: string;
  label: string;
  phase: "started" | "finished" | "gate-expired";
  at: string;
}

/** In-memory, like `logEntries` in log-job.ts — restarts wipe it. */
export const serialRunLog: SerialRunEntry[] = [];

// Gates are keyed by label. `released` is consulted first so a test that opens a
// gate BEFORE its job is dispatched (entirely possible — enqueue returns as soon
// as the row is durable) does not deadlock.
const released = new Set<string>();
const waiters = new Map<string, () => void>();

// Sticky "this lane is being drained" flag. Waking the CURRENT waiters is not
// enough on a serialized lane, and the difference is the whole point of the
// lane: at any instant at most one run has reached its gate, because the rest
// have not been fetched yet. So a `releaseAllGates()` that only walked `waiters`
// released exactly one run, and the next job — fetched moments later, once the
// queue freed — arrived to find its gate still shut and blocked for the full
// cap. Four held jobs drained in ~2×GATE_CAP_MS instead of promptly, which read
// as a product failure and was not one.
//
// Consulted by `holdGate` before it ever waits, so it covers runs that do not
// exist yet — which on this lane is most of them.
let laneOpen = false;

/** Let the run holding `label` finish. No-op if it is already through. */
export function releaseGate(label: string): void {
  released.add(label);
  const wake = waiters.get(label);
  if (wake) {
    waiters.delete(label);
    wake();
  }
}

/** Open every gate on this lane — the ones being waited on now AND any a
 * not-yet-fetched run will reach later. Called from each endpoint's `finally`,
 * so no early return can leave a handler blocked on the lane, and before a
 * deliberate drain. See `laneOpen`: on a serialized lane the runs still to come
 * are the majority, so waking only the current waiters does not drain anything. */
export function releaseAllGates(): void {
  laneOpen = true;
  for (const [label, wake] of [...waiters]) {
    released.add(label);
    waiters.delete(label);
    wake();
  }
}

/** Clear the run log and every gate. Called at the start of each endpoint. */
export function resetSerialLane(): void {
  serialRunLog.length = 0;
  releaseAllGates();
  released.clear();
  // Last: `releaseAllGates` above opens the lane to flush any leftovers from a
  // previous endpoint, and this run needs it shut again to hold a gate at all.
  laneOpen = false;
}

/** Resolves `true` if the cap expired rather than the gate opening. */
function holdGate(label: string): Promise<boolean> {
  if (laneOpen || released.has(label)) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(label);
      resolve(true);
    }, GATE_CAP_MS);
    waiters.set(label, () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

export const serialProbe = defineJob({
  name: "events_test.serial",
  input: z.object({
    run: z.string(),
    label: z.string(),
    /** Block until the test opens this label's gate. A held run is how a test
     * keeps the lane's queue lock taken while it inspects the rows behind it. */
    hold: z.boolean().default(false),
  }),
  event: z.never(),
  // Each enqueue is its own row on purpose: a singleton would collapse the four
  // rows whose independent fate is the whole assertion.
  dedup: "none",
  serial: { with: SERIAL_LANE },
  run: async ({ input: { run, label, hold } }) => {
    serialRunLog.push({
      run,
      label,
      phase: "started",
      at: new Date().toISOString(),
    });
    const expired = hold ? await holdGate(label) : false;
    if (expired) {
      // Not thrown: a throw would retry, and each retry would re-take the lane's
      // queue lock and block for another cap — turning a leaked gate into a
      // repeating wedge. The test asserts on this phase instead.
      console.warn(
        `[events-test] serial gate "${label}" expired after ${GATE_CAP_MS}ms — a harness run leaked its gate`,
      );
    }
    serialRunLog.push({
      run,
      label,
      phase: expired ? "gate-expired" : "finished",
      at: new Date().toISOString(),
    });
  },
});
