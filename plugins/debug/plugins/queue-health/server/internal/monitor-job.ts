import { z } from "zod";
import {
  defineJob,
  queryDeadJobStats,
  queryQueueBacklog,
  queryBacklogByJobName,
  queryRunningJobs,
} from "@plugins/infra/plugins/jobs/server";
import { getConfig } from "@plugins/config_v2/server";
import { recordReport } from "@plugins/reports/server";
import { queueHealthConfig } from "../../core";

// Cheap scheduled queue-health monitor. Runs every 5 min in EACH worktree's own
// DB fork (perWorktree) because every worktree backend runs its own graphile
// worker against its own queue tables, so dead/backlog state accumulates per-DB.
// `dedup: "singleton"` means the monitor itself can never pile up, and
// `maxAttempts: 3` keeps a transiently-broken monitor from becoming a dead-job
// storm of its own. Reads the queue through the jobs plugin's read-only
// introspection API (queryDeadJobStats/queryQueueBacklog) — it owns the
// graphile-internals coupling (task literal, jobName encoding, dead predicate),
// so this monitor can never drift from how the queue actually encodes things.
// Reports fire only when a threshold trips (silent when healthy).
export const queueHealthMonitorJob = defineJob({
  name: "debug.queue-health-monitor",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "*/5 * * * *", perWorktree: true },
  maxAttempts: 3,
  run: async () => {
    const cfg = getConfig(queueHealthConfig);
    if (!cfg.enabled) return;

    await checkDeadJobs();
    await checkBacklog(cfg.backlogDepthThreshold, cfg.oldestOverdueMinutes);
    await checkSlotHogs(cfg.runningJobMinutes);
  },
});

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
  backlogDepthThreshold: number,
  oldestOverdueMinutes: number,
): Promise<void> {
  const { readyCount, lockedCount, oldestOverdueMs } = await queryQueueBacklog();
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
async function checkSlotHogs(runningJobMinutes: number): Promise<void> {
  const thresholdMs = runningJobMinutes * 60_000;
  const running = await queryRunningJobs();

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

function firstLine(s: string): string {
  const line = s.split("\n", 1)[0] ?? s;
  return line.length > 160 ? `${line.slice(0, 159)}…` : line;
}
