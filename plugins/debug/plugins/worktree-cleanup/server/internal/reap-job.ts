import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { defineLogSink } from "@plugins/primitives/plugins/log-channels/server";
import { collectReapable, type ReapTarget } from "./reap-policy";
import { reapAttempt } from "./reap";

const log = defineLogSink({
  id: "worktree-cleanup",
  description:
    "Worktree-cleanup reaper ops log: stale git worktree + Postgres DB-fork removals.",
});

// Run `fn` over `items` with at most `limit` concurrent executions.
async function pMap<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      await fn(items[i]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
}

// Automatic reaper for stale worktrees + orphaned fork DBs. Runs hourly on the
// main runtime only (no perWorktree) — DBs are a global cluster resource, so a
// single sweep covers all worktrees (mirrors database.fork-temp-sweep).
//
// Per-target failures are contained (logged, not re-thrown): one corrupt fork
// must not block the rest, and the sweep is idempotent — the next hourly run
// retries whatever this run could not reap.
export const worktreeReapJob = defineJob({
  name: "worktree-cleanup.reap-stale",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  // `dedup: "singleton"` is NOT enough to bound this job's slot cost, and the
  // difference is what makes `serial` load-bearing here rather than tidy.
  // graphile clears a job_key on a row that is no longer `is_available`
  // (sql/000018.sql:107-116), and a LOCKED row is not available — so a tick that
  // fires while the previous run is still going does not collapse onto it, it
  // inserts a fresh row that gets fetched into a second slot. This handler still
  // awaits `git worktree remove` with no timeout (see removeWorktreeUnlogged in
  // infra/worktree), so "still going" can mean forever: one wedged run would
  // become one more wedged slot every hour until the pool of 4 was gone. That is
  // the 2026-08-17 outage again, four hours slower.
  //
  // `serial` bounds it at exactly one slot no matter how many ticks wedge:
  // graphile refuses to FETCH a job whose queue is busy, so the later ticks wait
  // in the ready backlog, where waiting costs nothing and is visible to
  // queue-health. The timeout on the git subprocess is still the real fix and is
  // still owed — this only caps the blast radius until it lands.
  serial: true,
  schedule: { cron: "0 * * * *" }, // hourly
  async run() {
    const targets = await collectReapable(Date.now());
    let reaped = 0;

    // Per-caller cap kept ≤ the host `worktree-mutate` gate size. The host gate
    // (infra/worktree.withWorktreeMutateSlot) is now the HARD bound on concurrent
    // full-tree `git worktree remove`s across every process; this local cap keeps
    // the reap from flooding the shared flock queue with more waiters than the gate
    // can grant, always leaving headroom for an interactive spawn's checkout
    // (two-tier fairness, mirroring host-read-pool's per-worktree tier).
    await pMap(targets, 3, async (t: ReapTarget) => {
      try {
        await reapAttempt(t.id, { worktreePath: t.worktreePath });
        reaped++;
      } catch (err) {
        log.publish(`reap ${t.id} failed: ${String(err)}`, "stderr");
      }
    });

    log.publish(`auto-reap: ${reaped}/${targets.length} reaped`);
  },
});
