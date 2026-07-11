// Pure helpers for the sentinel tick — kept IO-free so they are bun-testable.

/** Row shape of the one batched pg-stats round trip (see worker/pg.ts). */
export interface PgStatsRow {
  locks_waiting: string | number | null;
  blk_read_time: string | number | null;
  xact_commit: string | number | null;
  wait_events: Record<string, number> | null;
  active_backends: string | number | null;
  total_backends: string | number | null;
}

export interface PgStats {
  locksWaiting: number;
  blkReadTimeMs: number;
  xactCommit: number;
  waitEvents: Record<string, number>;
  activeBackends: number;
  totalBackends: number;
}

export function mapPgStatsRow(row: PgStatsRow): PgStats {
  return {
    locksWaiting: Number(row.locks_waiting ?? 0),
    blkReadTimeMs: Number(row.blk_read_time ?? 0),
    xactCommit: Number(row.xact_commit ?? 0),
    waitEvents: row.wait_events ?? {},
    activeBackends: Number(row.active_backends ?? 0),
    totalBackends: Number(row.total_backends ?? 0),
  };
}

/**
 * Per-tick delta against the previous cumulative reading. Null when there is
 * no baseline (first tick) — a counter reset (pg restart) would read negative,
 * which also yields null rather than a bogus spike.
 */
export function counterDelta(prev: number | null, current: number): number | null {
  if (prev === null) return null;
  const delta = current - prev;
  return delta < 0 ? null : delta;
}

/**
 * Counts singularity build/check/push CLI processes in a `ps -axo command=`
 * listing. Matches the CLI invocation shapes (`./singularity build`,
 * `singularity check ...`) while excluding this scan itself (`ps`) and
 * unrelated mentions (paths containing the word inside another token).
 */
export function countBuildProcesses(psOutput: string): number {
  let n = 0;
  for (const line of psOutput.split("\n")) {
    if (/(^|\/|\s)singularity\s+(build|check|push)\b/.test(line)) n++;
  }
  return n;
}
