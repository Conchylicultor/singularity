import {
  queryDeadJobStats,
  queryQueueBacklog,
  queryBacklogByJobName,
  queryRunningJobs,
  JOB_CONCURRENCY,
  type RunningJobStat,
  type QueueBacklogStat,
} from "@plugins/infra/plugins/jobs/server";
import { getConfig } from "@plugins/config_v2/server";
import { recordReport } from "@plugins/reports/server";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { queueHealthConfig } from "../../core";
import { formatDurationMs } from "../../shared/format-duration";

// The queue-health watchdog: a raw `setInterval` on the backend's own event
// loop, started from `onReady` and stopped in `onShutdown`.
//
// WHY IT IS NOT A `defineJob` ANY MORE. It used to be one —
// `debug.queue-health-monitor`, `{ cron: "*/5 * * * *", perWorktree: true }` —
// and on 2026-08-17 main's queue wedged for 70 minutes with eleven copies of
// that monitor sitting in the frozen backlog it existed to report. A monitor
// queued behind the failure it detects detects nothing. The doctrine was
// already written down, in this repo, on `jobs/server/internal/stuck-lock-sweeper.ts`:
//
//   "Why this stays a raw setInterval and NOT a scheduled defineJob: it is the
//    recovery mechanism FOR the job system. Routing it through graphile's own
//    queue would mean a wedged worker (the exact failure this clears) couldn't
//    run its own recovery — a deadlock. Infra that recovers the job system must
//    not depend on the job system."
//
// This file is that doctrine applied to the alarm rather than the recovery, and
// it is modeled on the sweeper byte for byte: module-level timer, start/stop
// pair, `runTracked` wrapper, `.catch → console.warn`, plus an exported
// `queueHealthTickOnce()` for forcing a tick instead of waiting for the next
// one (the sweeper's `sweepOnce`).
//
// WHY IT LIVES IN `debug/queue-health` AND NOT BESIDE THE SWEEPER IN `jobs`: the
// plugin DAG forbids the other placement. `reports/server/internal/record-report.ts`
// imports `recordNotification` from `shell/notifications`, whose barrel imports
// a `defineJob` from `jobs` — so `jobs → reports → shell/notifications → jobs`
// is a cycle, and `no cycles` is enforced by `./singularity check
// plugin-boundaries`. This plugin already imports both `jobs` and `reports`, so
// the placement adds zero new plugin edges, and it keeps queue INTERPRETATION
// (thresholds, config, report kinds) out of the load-bearing mechanism-only
// `jobs` plugin.
//
// Known escalation, deliberately not built: this rides the same event loop it
// watches, so a wedged LOOP silences it. That failure class belongs one level
// lower — the sentinel's worker thread — per the rule that a monitor runs
// exactly one level below the subsystem it watches, and no lower.

// 30s, so six samples fit in the default three-minute wedge window. The window
// is the trip condition; the cadence only decides how many independent samples
// prove it. At six, one slow or skipped tick cannot false-negative a real wedge
// — and the wedge test needs consecutive samples of an UNCHANGED locked set, so
// too few samples would make a single lucky sample decide an outage alarm.
//
// A module constant, not config, for the same reason the sweeper's
// `SWEEP_INTERVAL_MS` is: it is a property of the detector, not a threshold an
// operator tunes. `wedgeMinutes` is the tunable one.
const TICK_MS = 30_000;

// Terminally-dead jobs do not need 30s resolution — a dead-letter is dead until
// someone retries it, and its report dedups per jobName anyway. Sampling it
// every 10th tick keeps the healthy path at two aggregates plus a `pg_locks`
// scan bounded by the slot count, and preserves the 5-minute cadence the
// scheduled monitor used to give it.
const DEAD_JOB_EVERY_N_TICKS = 10;

let timer: ReturnType<typeof setInterval> | null = null;
let tickCount = 0;

// The ONLY state the wedge detector carries: which slots were held at the last
// sample, and when that exact set was first seen. A wedge is "this set has not
// changed", which no single sample can express. Cleared the moment any of the
// four conditions stops holding, so a queue that resumes draining starts the
// clock over rather than tripping on stale evidence.
//
// One entry today because the worker drains one shared pool. When lanes land
// this becomes a `Map<lane, …>` keyed the same way — the shape is already
// per-pool, it just has one pool.
let wedgeCandidate: { ids: Set<string>; since: number } | null = null;

export function startQueueHealthWatchdog(): void {
  if (timer) return;
  timer = setInterval(() => {
    void runTracked("queue-health:tick", () =>
      // eslint-disable-next-line promise-safety/no-bare-catch
      queueHealthTickOnce().catch((err) => {
        console.warn("[queue-health] watchdog tick failed", err);
      }),
    );
  }, TICK_MS);
}

export function stopQueueHealthWatchdog(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    // Drop the wedge evidence with the timer. A restarted watchdog has not
    // observed anything yet, and a set of ids captured before a shutdown says
    // nothing about the queue after it.
    wedgeCandidate = null;
  }
}

// One sample of the queue. Exported so a caller can force a tick instead of
// waiting up to 30s for the next one — the same role `sweepOnce` plays for the
// stuck-lock sweeper.
//
// Reads the queue through the jobs plugin's read-only introspection API, which
// owns the graphile-internals coupling (the `jobs.run` task literal, the
// `payload->>'jobName'` encoding, the ready/dead predicates, the `pg_locks` key
// encoding behind `alive`), so this watchdog can never drift from how the queue
// is actually encoded. Reports fire only on a tripped threshold — silent when
// healthy.
export async function queueHealthTickOnce(): Promise<void> {
  const cfg = getConfig(queueHealthConfig);
  if (!cfg.enabled) return;

  const tick = tickCount++;

  // Both aggregates are taken ONCE per tick and shared by all three live checks
  // — backlog, slot-hog and wedge all read the same snapshot. That matters
  // beyond cost: the wedge test compares a locked-id set against a locked count,
  // and two separate queries could disagree about a slot that freed between
  // them, which would read as "the set changed" and reset the clock forever.
  const [backlog, running] = await Promise.all([
    queryQueueBacklog(),
    queryRunningJobs(),
  ]);

  await checkWedge(backlog, running, cfg.wedgeMinutes);
  await checkBacklog(
    backlog,
    cfg.backlogDepthThreshold,
    cfg.oldestOverdueMinutes,
  );
  await checkSlotHogs(running, cfg.runningJobMinutes);

  if (tick % DEAD_JOB_EVERY_N_TICKS === 0) await checkDeadJobs();
}

// The queue has stopped draining. Four conditions, all of which must hold
// continuously for `wedgeMinutes`:
//
//   1. every slot is held (`running.length >= JOB_CONCURRENCY` — `>=` because a
//      locked row briefly outliving its slot must not un-trip a real wedge);
//   2. the set of locked job ids is UNCHANGED since the candidate was opened —
//      this is the one that separates "wedged" from "busy". A saturated pool
//      that is completing jobs churns its ids every tick and never trips;
//   3. `readyCount > 0` — work is actually being starved. A pool fully held by
//      four long jobs with an empty queue behind them is a busy machine, not an
//      outage;
//   4. every holder is `alive` — its advisory lock is held by a live backend.
//      A row whose owner DIED is the stuck-lock sweeper's job, and it will
//      reclaim it within a minute; reporting it here would double-report a
//      condition that is already recovering itself.
async function checkWedge(
  backlog: QueueBacklogStat,
  running: RunningJobStat[],
  wedgeMinutes: number,
): Promise<void> {
  const saturated = running.length >= JOB_CONCURRENCY;
  const starving = backlog.readyCount > 0;
  const allAlive = running.every((r) => r.alive);

  if (!saturated || !starving || !allAlive) {
    wedgeCandidate = null;
    return;
  }

  const ids = new Set(running.map((r) => r.jobId));
  const now = Date.now();
  if (!wedgeCandidate || !sameSet(wedgeCandidate.ids, ids)) {
    // First sample of this exact locked set. Open a candidate and wait — one
    // sample can never prove nothing is completing.
    wedgeCandidate = { ids, since: now };
    return;
  }
  if (now - wedgeCandidate.since < wedgeMinutes * 60_000) return;

  // How long the slots have been held, read off graphile's `locked_at` rather
  // than off `wedgeCandidate.since`. Every slot has been held AT LEAST this
  // long, which stays true when a backend boots into an already-wedged queue —
  // our own observation window would understate it to `wedgeMinutes`.
  const heldForMs = Math.min(...running.map((r) => r.lockedForMs));

  // Attribute who is starved. Only fetched on the already-tripped path, so the
  // healthy 30s tick stays two aggregate queries.
  const topReady = await queryBacklogByJobName();

  await recordReport({
    kind: "queue-wedged",
    source: "server-queue-monitor",
    data: {
      concurrency: JOB_CONCURRENCY,
      readyCount: backlog.readyCount,
      heldForMs,
      holders: running.map((r) => ({
        jobName: r.jobName,
        jobId: r.jobId,
        lockedForMs: r.lockedForMs,
      })),
      topReady,
    },
    message:
      `queue wedged — ${running.length}/${JOB_CONCURRENCY} slots held ` +
      `≥${formatDurationMs(heldForMs)} by ${summarizeHolders(running)}; ` +
      `${backlog.readyCount} ready`,
  });
}

// Terminally-dead jobs grouped by jobName → one report per distinct jobName.
async function checkDeadJobs(): Promise<void> {
  const stats = await queryDeadJobStats();
  for (const s of stats) {
    await recordReport({
      kind: "queue-dead-job",
      source: "server-queue-monitor",
      data: {
        jobName: s.jobName,
        deadCount: s.deadCount,
        attempts: s.attempts,
        maxAttempts: s.maxAttempts,
        lastError: s.lastError,
        sampleJobId: s.sampleJobId,
      },
      message: `${s.jobName} ×${s.deadCount}${
        s.lastError ? ` — ${firstLine(s.lastError)}` : ""
      }`,
    });
  }
}

// Queue depth/stall. Trips on either depth or staleness; `stalled` = overdue but
// nothing running (the worker is making no progress).
async function checkBacklog(
  backlog: QueueBacklogStat,
  backlogDepthThreshold: number,
  oldestOverdueMinutes: number,
): Promise<void> {
  const { readyCount, lockedCount, oldestOverdueMs } = backlog;
  const oldestThresholdMs = oldestOverdueMinutes * 60_000;

  const stalled = lockedCount === 0 && oldestOverdueMs > oldestThresholdMs;
  const tripped =
    readyCount > backlogDepthThreshold || oldestOverdueMs > oldestThresholdMs;
  if (!tripped) return;

  // Attribute the rollup: which jobs are filling the ready queue. Only fetched
  // when the threshold has already tripped, so the healthy path stays two
  // aggregate queries.
  const topReady = await queryBacklogByJobName();

  await recordReport({
    kind: "queue-backlog",
    source: "server-queue-monitor",
    data: { readyCount, oldestOverdueMs, lockedCount, stalled, topReady },
    message: stalled
      ? `STALLED — ${readyCount} ready, 0 running, oldest overdue ${Math.round(
          oldestOverdueMs / 1000,
        )}s`
      : `${readyCount} ready, ${lockedCount} running, oldest overdue ${Math.round(
          oldestOverdueMs / 1000,
        )}s`,
  });
}

// Slot-hogging: a job holding a shared worker slot longer than the threshold —
// the failure mode the backlog `stalled` signal (0 locked) cannot see. Collapse
// the currently-locked rows to the longest-held per jobName, then file one
// report per jobName over the threshold.
async function checkSlotHogs(
  running: RunningJobStat[],
  runningJobMinutes: number,
): Promise<void> {
  const thresholdMs = runningJobMinutes * 60_000;

  // queryRunningJobs is ordered by lockedForMs DESC, so the first row seen for a
  // jobName is its longest-held slot. Also count concurrent rows for that job.
  const longestPerJob = new Map<
    string,
    { lockedForMs: number; sampleJobId: string; runningCount: number }
  >();
  for (const r of running) {
    const existing = longestPerJob.get(r.jobName);
    if (existing) {
      existing.runningCount += 1;
    } else {
      longestPerJob.set(r.jobName, {
        lockedForMs: r.lockedForMs,
        sampleJobId: r.jobId,
        runningCount: 1,
      });
    }
  }

  for (const [jobName, agg] of longestPerJob) {
    if (agg.lockedForMs <= thresholdMs) continue;
    await recordReport({
      kind: "queue-slot-hog",
      source: "server-queue-monitor",
      data: {
        jobName,
        lockedForMs: agg.lockedForMs,
        runningCount: agg.runningCount,
        sampleJobId: agg.sampleJobId,
      },
      message: `${jobName} holding a slot for ${Math.round(
        agg.lockedForMs / 1000,
      )}s`,
    });
  }
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

// "prototypes.render-thumbnail ×3, worktree-cleanup.reap-stale" — who is on the
// slots, deepest first, for the one-line report message.
function summarizeHolders(running: RunningJobStat[]): string {
  const counts = new Map<string, number>();
  for (const r of running)
    counts.set(r.jobName, (counts.get(r.jobName) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([jobName, n]) => (n > 1 ? `${jobName} ×${n}` : jobName))
    .join(", ");
}

function firstLine(s: string): string {
  const line = s.split("\n", 1)[0] ?? s;
  return line.length > 160 ? `${line.slice(0, 159)}…` : line;
}
