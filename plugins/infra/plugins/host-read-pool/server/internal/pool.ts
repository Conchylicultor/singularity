import { createHostSemaphore } from "@plugins/packages/plugins/host-semaphore/server";
import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
import { chargeWait, registerGateGauge } from "@plugins/infra/plugins/runtime-profiler/core";
import { cpus } from "node:os";

function heavyReadSize(): number {
  const env = process.env.SINGULARITY_HEAVY_READ_CONCURRENCY;
  if (env) {
    const n = parseInt(env, 10);
    if (n > 0) return n;
  }
  return Math.max(1, Math.floor(cpus().length / 4));
}

// Per-process (= per-worktree) local cap on heavy reads. Sits in front of the
// host-wide flock gate so this one backend can only ever present a bounded slice
// of work to the shared queue — preventing a single worktree from monopolizing
// the host gate during a storm (a `main` advance fanning out across ~16
// backends). Default ~ceil(host/2); clamped to 1 ≤ local ≤ host so it never
// over-serializes a legitimate burst and never exceeds (and thus never reorders
// vs.) the host size. Env-overridable for tuning.
function localSize(): number {
  const host = heavyReadSize();
  const env = process.env.SINGULARITY_HEAVY_READ_LOCAL_CONCURRENCY;
  let local = Math.max(1, Math.ceil(host / 2));
  if (env) {
    const n = parseInt(env, 10);
    if (n > 0) local = n;
  }
  return Math.min(host, Math.max(1, local));
}

const perWorktreeGate = createSemaphore(localSize());
const pool = createHostSemaphore({ name: "heavy-read", size: heavyReadSize() });

// Host-tier slots currently held BY THIS PROCESS. The flock gate is host-wide,
// but host-WIDE occupancy across other worktree processes is not cheaply
// readable from the flock slot files — so the `heavy-read-acquire` gauge below
// reports this process's held slots + this process's parked depth, against the
// host-wide `max`.
let heldByThisProcess = 0;

// Occupancy gauges for the flight recorder's gate snapshot: layer names join to
// the same-named `chargeWait` layers in span `waits` (see withHeavyReadSlot).
registerGateGauge("heavy-read-local", () => perWorktreeGate.stats());
registerGateGauge("heavy-read-acquire", () => ({
  active: heldByThisProcess,
  queued: pool.depth(),
  max: heavyReadSize(),
}));

export function withHeavyReadSlot<T>(fn: () => Promise<T>): Promise<T> {
  // Two-tier gate: the local per-worktree semaphore wraps OUTSIDE the host-wide
  // flock gate. It bounds how many heavy ops *this* backend can have parked in
  // the shared flock queue at once, so under a cross-worktree storm one worktree
  // can't starve the others — each presents at most `localSize()` waiters before
  // it must first drain locally. Only after passing the local gate does the op
  // compete host-wide for an actual slot.
  //
  // Each tier charges its wait distinctly to the enclosing entry (loader/http):
  // the host-wide cross-process lock-wait under "heavy-read-acquire" and the
  // local in-process queue-wait under "heavy-read-local", so a heavy git/fs
  // loader's span reads as wait-vs-work directly (e.g. edited-files 4032ms = lock
  // 3500 / git diff 532) instead of one opaque number. Context-less callers fall
  // back to a standalone span inside chargeWait.
  return perWorktreeGate.run(
    () =>
      pool.run(
        async () => {
          // The callback runs only once the host slot is held — the counter
          // brackets exactly the held window for the occupancy gauge above.
          heldByThisProcess++;
          try {
            return await fn();
          } finally {
            heldByThisProcess--;
          }
        },
        (waitMs) => chargeWait("heavy-read-acquire", waitMs),
      ),
    (waitMs) => chargeWait("heavy-read-local", waitMs),
  );
}

// The host-wide heavy-read gate's slot count (`floor(cpus/4)`, env-overridable).
// Exposed so callers can size a same-named occupant pool to exactly saturate the
// gate without re-deriving the formula.
export function heavyReadSlotCount(): number {
  return heavyReadSize();
}

// Queue-depth gauge for the host-wide heavy-read gate: how many callers are
// currently parked waiting for a slot (0 = uncontended). Observability-only,
// surfaced in the health-monitor Backends overview.
export function heavyReadQueueDepth(): number {
  return pool.depth();
}
