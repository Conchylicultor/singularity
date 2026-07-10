import { createHostSemaphore } from "@plugins/packages/plugins/host-semaphore/server";
import { chargeWait, registerGateGauge } from "@plugins/infra/plugins/runtime-profiler/core";

// A DEDICATED host-wide gate for the DB fork's `pg_dump | pg_restore` pipeline —
// until this gate, the fork was the ONLY heavy launch step with zero admission
// control (JOB_CONCURRENCY=4 alone permitted 4 concurrent dump|restore pairs).
//
// Why a gate at all when the dump/restore CLIENTS are darwinbg-demoted
// (spawn-priority): the heavy server-side work — COPY parsing, index builds —
// runs inside Postgres backends, children of the postmaster, which our spawn
// demotion cannot reach. Bounding concurrent forks caps that un-demotable
// work at ~`size` cores. Size 2 keeps a single/double launch flowing while a
// launch storm queues (attributed, see below) instead of stacking restores.
//
// The acquire-wait is charged to the enclosing profiler entry (the
// `database.fork` job span) as the named `db-fork-acquire` layer, and the gate
// registers a gauge — mirroring worktree-mutate + host-read-pool — so added
// queueing shows up attributed in get_runtime_profile / slow-ops / the flight
// recorder, never as anonymous slowness.
// See research/2026-07-07-global-background-work-priority-isolation.md.
//
// NO env override: `size` names the flock SLOT FILES (`slot-0 … slot-(N-1)`), so it
// MUST be identical in every process — a process sized to 2 only sweeps `slot-0..1`
// and is blind to one holding `slot-3`, silently exceeding the bound. A constant (or
// a pure function of stable host facts) is what prevents that; the primitive's size
// sentinel only makes a residual mismatch loud.
function forkSize(): number {
  return 2;
}

const gate = createHostSemaphore({ name: "db-fork", size: forkSize() });

// Held-by-this-process count; host-wide occupancy across other processes is not
// cheaply readable (same documented limitation as host-read-pool's gauge).
let held = 0;
registerGateGauge("db-fork-acquire", () => ({
  active: held,
  queued: gate.depth(),
  max: forkSize(),
}));

export function withDbForkSlot<T>(fn: () => Promise<T>): Promise<T> {
  return gate.run(
    async () => {
      held++;
      try {
        return await fn();
      } finally {
        held--;
      }
    },
    { onAcquired: (waitMs) => chargeWait("db-fork-acquire", waitMs) },
  );
}
