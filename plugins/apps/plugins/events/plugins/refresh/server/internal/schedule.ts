import type { RefreshCadence } from "@plugins/apps/plugins/events/plugins/events-core/core";

// The cadence → watermark arithmetic, alone and pure.
//
// `next_run_at` is the scheduler's ONLY input (the cron tick just asks "which
// enabled sources are due"), so a cadence change takes effect the moment this
// value is rewritten — no cron edits, no per-source schedule rows.

/**
 * How long after a run the next one is due. A total `Record` over the cadence
 * union on purpose: adding a cadence to `REFRESH_CADENCES` is then a tsc error
 * here rather than a source that silently never runs again.
 *
 * `manual` is `null` — "never scheduled", not "zero delay". The tick's predicate
 * excludes manual sources anyway; this is the second, type-level guard.
 */
const CADENCE_INTERVAL_MS: Record<RefreshCadence, number | null> = {
  manual: null,
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

/**
 * The watermark to write after a run finished at `from` — `null` for a manual
 * source, which the cadence tick must never pick up.
 *
 * Measured from the run's END rather than its scheduled slot, so a source that
 * takes minutes to extract can never queue up a backlog of overdue ticks.
 */
export function computeNextRunAt(
  cadence: RefreshCadence,
  from: Date,
): Date | null {
  const intervalMs = CADENCE_INTERVAL_MS[cadence];
  return intervalMs === null ? null : new Date(from.getTime() + intervalMs);
}
