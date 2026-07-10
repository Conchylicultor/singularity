import { createHostSemaphore } from "@plugins/packages/plugins/host-semaphore/server";
import { chargeWait, registerGateGauge } from "@plugins/infra/plugins/runtime-profiler/core";
import { cpus } from "node:os";

// A DEDICATED host-wide gate for heavy `git worktree add`/`remove` — deliberately
// SEPARATE from `heavy-read` (infra/host-read-pool), not a reuse of it:
//
// - `heavy-read` bounds cheap-ish interactive READS (edited-files, commits-graph,
//   code navigation). A worktree mutation is a heavy WRITE (a ~3.8 s / 77 MB /
//   8385-file checkout, or a ~1.2 s full-tree `rm`). Routing a 3.8 s write through
//   the read gate would head-of-line-block interactive reads behind it — the exact
//   opposite of what we want. Two independent budgets keep read latency and write
//   throughput decoupled.
//
// This gate is a BOUNDARY INVARIANT + containment, not the cost-axis cure: it bounds
// how many full-tree checkouts/removes run at once across ALL worktree backends (the
// spawn job, the reap, manual deletes, and staging-land all live in different
// processes, so only a cross-process flock semaphore can bound them). It is the
// backstop that keeps the box in the flat region — K≤4 concurrent adds stay
// ~baseline, K≥6 degrades ~+75 %/op and drives a +141 % foreground slowdown under a
// 6-way churn. The irreducible per-op cost (the 77 MB working tree) is a separate,
// deeper lever (sparse-checkout). See
// research/perfs/2026-07-02-worktree-mutation-host-gate-DESIGN.md.
//
// NO env override: `size` names the flock SLOT FILES (`slot-0 … slot-(N-1)`), so it
// MUST be identical in every process — a backend sized to 3 only sweeps `slot-0..2`
// and is blind to one holding `slot-5`, silently exceeding the bound. A pure function
// of stable host facts (`os.cpus()`) is what prevents that; the primitive's size
// sentinel only makes a residual mismatch loud.
function mutateSize(): number {
  return Math.max(2, Math.floor(cpus().length / 6)); // 18 CPUs -> 3; conservative
}

const gate = createHostSemaphore({ name: "worktree-mutate", size: mutateSize() });

// Held-by-this-process count; host-wide occupancy across other processes is not
// cheaply readable (same documented limitation as host-read-pool's gauge).
let held = 0;
registerGateGauge("worktree-mutate-acquire", () => ({
  active: held,
  queued: gate.depth(),
  max: mutateSize(),
}));

// Wrap the heavy `git worktree add`/`remove` subprocess. The acquire-wait is charged
// to the enclosing profiler entry (job/http) so a saturated gate stays attributable
// in get_runtime_profile / slow-ops, mirroring host-read-pool. Context-less callers
// (graphile jobs) fall back to a standalone span inside chargeWait.
export function withWorktreeMutateSlot<T>(fn: () => Promise<T>): Promise<T> {
  return gate.run(
    async () => {
      held++;
      try {
        return await fn();
      } finally {
        held--;
      }
    },
    { onAcquired: (waitMs) => chargeWait("worktree-mutate-acquire", waitMs) },
  );
}
