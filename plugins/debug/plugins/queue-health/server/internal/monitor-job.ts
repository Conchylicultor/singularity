import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { getConfig } from "@plugins/config_v2/server";
import { recordReport } from "@plugins/reports/server";
import { queueHealthConfig } from "../../core";

// graphile-worker stores every Singularity job under the single `jobs.run` task
// identifier; the real job name lives in `payload->>'jobName'`. Same shape the
// jobs plugin's own SQL (dead-job-gc.ts, resources.ts) reads — kept as a local
// literal rather than imported (JOB_TASK is not on the jobs barrel, and the
// value is a load-bearing protocol constant that never changes).
const JOB_TASK = "jobs.run";

// One terminally-dead row per distinct jobName: count, the worst-case attempt
// counters, the latest error, and a sample graphile job id for hand-inspection.
interface DeadJobAggRow {
  job_name: string;
  dead_count: number;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  sample_job_id: string | null;
}

// A single aggregate snapshot of the whole queue's depth/stall state.
interface BacklogAggRow {
  ready_count: number;
  locked_count: number;
  // bigint comes back from pg as a string; coerced to number below.
  oldest_overdue_ms: string;
}

// Cheap scheduled queue-health monitor. Runs every 5 min in EACH worktree's own
// DB fork (perWorktree) because every worktree backend runs its own graphile
// worker against its own queue tables, so dead/backlog state accumulates per-DB.
// `dedup: "singleton"` means the monitor itself can never pile up, and
// `maxAttempts: 3` keeps a transiently-broken monitor from becoming a dead-job
// storm of its own. Two cheap aggregate queries per run (no row fetches); reports
// fire only when a threshold trips (silent when healthy).
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
  },
});

// Query 1 — terminally-dead jobs grouped by jobName. "Dead" = exhausted retries
// AND not currently locked (`attempts >= max_attempts AND locked_at IS NULL`),
// the same predicate reconcileDeadJobs uses. One report per distinct jobName.
async function checkDeadJobs(): Promise<void> {
  const result = await db.execute(sql`
    SELECT payload->>'jobName'                                  AS job_name,
           count(*)::int                                        AS dead_count,
           max(attempts)::int                                   AS attempts,
           max(max_attempts)::int                               AS max_attempts,
           (array_agg(last_error ORDER BY updated_at DESC))[1]  AS last_error,
           (array_agg(j.id::text ORDER BY updated_at DESC))[1]  AS sample_job_id
      FROM graphile_worker._private_jobs j
      JOIN graphile_worker._private_tasks t ON t.id = j.task_id
     WHERE t.identifier = ${JOB_TASK}
       AND j.attempts >= j.max_attempts
       AND j.locked_at IS NULL
     GROUP BY 1
  `);

  const rows = result.rows as unknown as DeadJobAggRow[];
  for (const r of rows) {
    const jobName = r.job_name ?? "(unknown)";
    await recordReport({
      kind: "queue-dead-job",
      source: "server-queue-monitor",
      data: {
        jobName,
        deadCount: r.dead_count,
        attempts: r.attempts,
        maxAttempts: r.max_attempts,
        lastError: r.last_error,
        sampleJobId: r.sample_job_id,
      },
      message: `${jobName} ×${r.dead_count}${
        r.last_error ? ` — ${firstLine(r.last_error)}` : ""
      }`,
    });
  }
}

// Query 2 — one aggregate over the queue: readyCount (overdue, unlocked,
// retry-eligible), lockedCount (currently running), oldestOverdueMs (age of the
// oldest ready job). Trips on either depth or staleness; `stalled` = overdue but
// nothing running (the worker is making no progress).
async function checkBacklog(
  backlogDepthThreshold: number,
  oldestOverdueMinutes: number,
): Promise<void> {
  const result = await db.execute(sql`
    SELECT count(*) FILTER (
             WHERE run_at <= now() AND locked_at IS NULL AND attempts < max_attempts
           )::int AS ready_count,
           count(*) FILTER (WHERE locked_at IS NOT NULL)::int AS locked_count,
           coalesce(
             extract(epoch FROM (
               now() - min(run_at) FILTER (
                 WHERE run_at <= now() AND locked_at IS NULL AND attempts < max_attempts
               )
             )) * 1000,
             0
           )::bigint AS oldest_overdue_ms
      FROM graphile_worker._private_jobs j
      JOIN graphile_worker._private_tasks t ON t.id = j.task_id
     WHERE t.identifier = ${JOB_TASK}
  `);

  const row = (result.rows as unknown as BacklogAggRow[])[0];
  if (!row) return;

  const readyCount = row.ready_count;
  const lockedCount = row.locked_count;
  const oldestOverdueMs = Number(row.oldest_overdue_ms);
  const oldestThresholdMs = oldestOverdueMinutes * 60_000;

  const stalled = lockedCount === 0 && oldestOverdueMs > oldestThresholdMs;
  const tripped =
    readyCount > backlogDepthThreshold || oldestOverdueMs > oldestThresholdMs;
  if (!tripped) return;

  await recordReport({
    kind: "queue-backlog",
    source: "server-queue-monitor",
    data: { readyCount, oldestOverdueMs, lockedCount, stalled },
    message: stalled
      ? `STALLED — ${readyCount} ready, 0 running, oldest overdue ${Math.round(
          oldestOverdueMs / 1000,
        )}s`
      : `${readyCount} ready, ${lockedCount} running, oldest overdue ${Math.round(
          oldestOverdueMs / 1000,
        )}s`,
  });
}

function firstLine(s: string): string {
  const line = s.split("\n", 1)[0] ?? s;
  return line.length > 160 ? `${line.slice(0, 159)}…` : line;
}
