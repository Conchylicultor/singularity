import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { defineLogSink } from "@plugins/primitives/plugins/log-channels/server";
import { recordReport } from "@plugins/reports/server";
import { WorktreeGitTimeoutError } from "@plugins/infra/plugins/worktree/server";
import { reclaimNamespace } from "@plugins/infra/plugins/worktree/plugins/reclaim/server";
import {
  collectReapable,
  type NamespaceReapTarget,
  type ReapTarget,
} from "./reap-policy";
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
  // minutes: drives `git worktree remove` subprocesses (3 at a time) under the
  // host-wide worktree-mutate flock and drops Postgres fork DBs. Orthogonal to
  // the `serial: true` below — that bounds how many ticks may hold a slot at
  // once; this declares how long one of them holds it.
  hold: "minutes",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  // `dedup: "singleton"` is NOT enough to bound this job's slot cost, and the
  // difference is what makes `serial` load-bearing here rather than tidy.
  // graphile clears a job_key on a row that is no longer `is_available`
  // (sql/000018.sql:107-116), and a LOCKED row is not available — so a tick that
  // fires while the previous run is still going does not collapse onto it, it
  // inserts a fresh row that gets fetched into a second slot. The git
  // subprocesses this handler drives are now bounded (see removeWorktreeUnlogged
  // in infra/worktree), so "still going" can no longer mean forever — but a bound
  // is minutes, not instant, so a slow sweep still overlaps the next tick and
  // would still accumulate one slot per hour.
  //
  // `serial` bounds it at exactly one slot no matter how many ticks overlap:
  // graphile refuses to FETCH a job whose queue is busy, so the later ticks wait
  // in the ready backlog, where waiting costs nothing and is visible to
  // queue-health.
  serial: true,
  schedule: { cron: "0 * * * *" }, // hourly
  async run() {
    const scan = await collectReapable(Date.now());
    const targets = scan.targets;
    const namespaceTargets = scan.namespaceTargets;
    let reaped = 0;
    let reclaimed = 0;

    // The scan's own shape, logged every tick. `scanned` vs `candidates` shows
    // how much of the attempt table has nothing left to reclaim (the cost the
    // readdir inversion removed), and `hygieneProbes` is K — the residual git
    // fan-out. K is what decides whether a negative hygiene cache is worth any
    // state at all; if it stays single-digit, the answer is no.
    log.publish(
      `auto-reap scan: scanned=${scan.scanned} candidates=${scan.candidates} hygieneProbes=${scan.hygieneProbes} targets=${targets.length} namespaceTargets=${namespaceTargets.length}`,
    );

    // Failures of the REPORTING path, not of a reap. Collected rather than
    // thrown where they happen, and re-thrown once the sweep is over — see the
    // inner catch and the throw at the end of the handler.
    const reportFailures: string[] = [];

    // One containment, both passes. A failure here is CONTAINED — one corrupt
    // fork or one undroppable database must not block the rest of the sweep, and
    // the sweep is idempotent, so the next hourly run retries whatever this one
    // could not reclaim — but containment must not mean silence. The log channel
    // nobody tails was the entire alerting story for the single most important
    // signal these bounds produce: a git child killed while holding a host-wide
    // `worktree-mutate` slot, i.e. the 2026-08-17 outage caught in the act. So
    // every contained failure also files a report, which reaches Debug → Reports
    // and the bell.
    const contain = async (
      targetId: string,
      work: () => Promise<void>,
    ): Promise<void> => {
      try {
        await work();
      } catch (err) {
        log.publish(`reap ${targetId} failed: ${String(err)}`, "stderr");
        // `timedOut` is read from the ERROR'S TYPE, never from its message: the
        // throw site knows for certain whether it killed a child, and a report
        // that fingerprints a wedge apart from an ordinary failure must not rest
        // on string matching.
        const wedge = err instanceof WorktreeGitTimeoutError ? err : undefined;
        try {
          await recordReport({
            kind: "worktree-reap-failed",
            source: "server-caught",
            message: `reap ${targetId} failed: ${String(err)}`,
            data: {
              targetId,
              timedOut: wedge !== undefined,
              ...(wedge
                ? { command: wedge.command, timeoutMs: wedge.timeoutMs }
                : {}),
              message: String(err),
            },
          });
        } catch (reportErr) {
          // Not swallowed — parked, and re-thrown below once every target has
          // been attempted. recordReport throws on a wiring bug (no registered
          // kind, a payload its schema rejects) and on a DB failure; both must
          // fail the job loudly, so neither may be dropped here. But throwing
          // from inside this worker would abandon the remaining targets — the
          // very containment this catch exists to preserve — and pMap's other
          // in-flight workers are only awaited through the Promise.all that a
          // throw here rejects, so a second failure would surface as an
          // unhandled rejection instead of a job failure. Parking keeps the
          // sweep whole AND the failure loud.
          reportFailures.push(String(reportErr));
        }
      }
    };

    // Per-caller cap kept ≤ the host `worktree-mutate` gate size. The host gate
    // (infra/worktree.withWorktreeMutateSlot) is now the HARD bound on concurrent
    // full-tree `git worktree remove`s across every process; this local cap keeps
    // the reap from flooding the shared flock queue with more waiters than the gate
    // can grant, always leaving headroom for an interactive spawn's checkout
    // (two-tier fairness, mirroring host-read-pool's per-worktree tier).
    await pMap(targets, 3, (t: ReapTarget) =>
      contain(t.id, async () => {
        await reapAttempt(t.id, { worktreePath: t.worktreePath });
        reaped++;
      }),
    );

    // The marker-owned namespaces, reclaimed through `reclaimNamespace` and never
    // through `reapAttempt`: these are not checkouts, there is no git worktree to
    // remove, and `reapAttempt` would resolve one from the name. Run AFTER the
    // checkout pass, which reclaims the namespaces of every checkout it reaps —
    // the scan already excludes those, and this order keeps the two from racing
    // over the same registry dir if it ever missed one.
    await pMap(namespaceTargets, 3, (t: NamespaceReapTarget) =>
      contain(t.ns, async () => {
        await reclaimNamespace(t.ns);
        reclaimed++;
      }),
    );

    log.publish(
      `auto-reap: ${reaped}/${targets.length} reaped, ` +
        `${reclaimed}/${namespaceTargets.length} orphaned namespaces reclaimed`,
    );

    // The sweep itself is finished; now fail the job so a broken reporting path
    // is visible in queue-health rather than being the second silent failure in
    // the same handler. The sweep is idempotent, so the retry costs nothing.
    if (reportFailures.length > 0) {
      throw new Error(
        `worktree reap: ${reportFailures.length} failure report(s) could not be ` +
          `recorded (the sweep itself ran to completion): ${reportFailures.join("; ")}`,
      );
    }
  },
});
