import { createHostSemaphore } from "@plugins/packages/plugins/host-semaphore/server";
import { chargeWait } from "@plugins/infra/plugins/runtime-profiler/core";
import { cpus } from "node:os";

function heavyReadSize(): number {
  const env = process.env.SINGULARITY_HEAVY_READ_CONCURRENCY;
  if (env) {
    const n = parseInt(env, 10);
    if (n > 0) return n;
  }
  return Math.max(1, Math.floor(cpus().length / 4));
}

const pool = createHostSemaphore({ name: "heavy-read", size: heavyReadSize() });

export function withHeavyReadSlot<T>(fn: () => Promise<T>): Promise<T> {
  // Charge the cross-process lock-wait to the enclosing entry (loader/http) under
  // the "heavy-read-acquire" layer, so a heavy git/fs loader's span reads as
  // wait-vs-work directly (e.g. edited-files 4032ms = lock 3500 / git diff 532)
  // instead of one opaque number. Context-less callers fall back to a standalone
  // span inside chargeWait.
  return pool.run(fn, (waitMs) => chargeWait("heavy-read-acquire", waitMs));
}

// Queue-depth gauge for the host-wide heavy-read gate: how many callers are
// currently parked waiting for a slot (0 = uncontended). Observability-only,
// surfaced in the health-monitor Backends overview.
export function heavyReadQueueDepth(): number {
  return pool.depth();
}
