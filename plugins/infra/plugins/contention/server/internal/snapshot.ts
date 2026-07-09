import os from "node:os";
import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import {
  runInBackgroundLane,
  runWithoutProfiling,
} from "@plugins/infra/plugins/runtime-profiler/core";
import type { ContentionSnapshot } from "../../core";

// pg returns count(*) as a bigint, which node-postgres surfaces as a string.
type BackendCountRow = { datname: string; active: string; total: string };

// On-demand memo: re-derive the snapshot at most once per second. During a
// contention storm many slow ops fire at once; this collapses them onto one
// cached read instead of N pg_stat_activity queries (which would self-amplify
// the very contention we're measuring). This is a lazy timestamp gate keyed on
// performance.now() — NOT a setInterval (the repo bans polling).
let cached: { at: number; snap: ContentionSnapshot } | null = null;
const CACHE_TTL_MS = 1000;

// A point-in-time, cluster-wide contention snapshot: OS load average + cores
// (in-process, free) plus the cluster-global Postgres backend counts. The pg
// counts come from THIS worktree's own pool — pg_stat_activity is a cluster-
// global view, so querying it through any database in the cluster returns every
// backend across all databases. No admin pool required.
export async function getContentionSnapshot(): Promise<ContentionSnapshot> {
  if (cached && performance.now() - cached.at <= CACHE_TTL_MS) {
    return cached.snap;
  }

  const [loadAvg1 = 0, loadAvg5 = 0, loadAvg15 = 0] = os.loadavg();
  const cpuCount = os.cpus().length;

  // Wrapped in runWithoutProfiling: this read is itself a `db` span that would
  // otherwise re-feed the slow-op recorder (the snapshot is captured FROM the
  // recorder, so an un-suppressed query would be self-referential). The await
  // MUST run inside the suppression scope — a lazy unexecuted query would run
  // its spans after the ALS scope exits, defeating suppression.
  //
  // Wrapped OUTSIDE that in runInBackgroundLane: the snapshot is measurement,
  // never the caller's own work, so it must not inherit its trigger's origin and
  // spend a reserved-interactive connection describing a slowdown to itself. The
  // await must stay inside the lane scope for the same reason it stays inside the
  // suppression scope. See
  // research/2026-07-09-global-interactive-lane-origin-based-db-gating.md.
  const rows = await runInBackgroundLane(() =>
    runWithoutProfiling(async () => {
      const result = await db.execute<BackendCountRow>(sql`
        SELECT datname,
               count(*) FILTER (WHERE state = 'active') AS active,
               count(*) AS total
        FROM pg_stat_activity
        WHERE datname IS NOT NULL
        GROUP BY datname
      `);
      return result.rows;
    }),
  );

  let pgActiveBackends = 0;
  let pgTotalBackends = 0;
  const perDatabase = rows.map((r) => {
    const active = Number(r.active);
    pgActiveBackends += active;
    pgTotalBackends += Number(r.total);
    return { datname: r.datname, active };
  });
  const pgTopDatabases = perDatabase
    .sort((a, b) => b.active - a.active)
    .slice(0, 5);

  const snap: ContentionSnapshot = {
    atTime: new Date(),
    loadAvg1,
    loadAvg5,
    loadAvg15,
    cpuCount,
    pgActiveBackends,
    pgTotalBackends,
    pgTopDatabases,
  };
  cached = { at: performance.now(), snap };
  return snap;
}
