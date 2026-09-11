import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import type { HealthStatus } from "@plugins/shell/plugins/health-report/web";
import type { QueryDeadlineHit, QueryDeadlines } from "../../core";

/** How long a lost query keeps the Database row in `attention`. */
export const RECENT_WINDOW_MS = 10 * 60_000;

export interface DatabaseVerdict {
  status: HealthStatus;
  /**
   * The next instant this verdict changes on its own — the soonest moment an
   * in-window hit ages out — or null when nothing is waiting to expire. The
   * hook schedules exactly one timer to it; there is no polling.
   */
  nextChangeAt: number | null;
}

function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function lostSummary(
  recent: readonly QueryDeadlineHit[],
  lastAt: number,
): string {
  return recent.length === 1
    ? `1 database query lost in the last 10 min — at ${clockTime(lastAt)}`
    : `${recent.length} database queries lost in the last 10 min — last at ${clockTime(lastAt)}`;
}

/**
 * The Database row's verdict from the resource read and the current instant.
 *
 * - still loading → `unknown` with no summary (the dot pulses: "Checking…"),
 *   never `ok` — a row that has not read its data must not claim green;
 * - failed to load → `unknown` with a summary (grey, still);
 * - a hit in the last 10 min → `attention`, counting them;
 * - otherwise → `ok`.
 */
export function databaseVerdict(
  result: ResourceResult<QueryDeadlines>,
  now: number,
): DatabaseVerdict {
  if (result.pending) {
    return {
      status:
        result.error === null
          ? { state: "unknown" }
          : {
              state: "unknown",
              summary: "Couldn't load the lost-query history",
            },
      nextChangeAt: null,
    };
  }

  const recent = result.data.hits.filter((h) => h.at > now - RECENT_WINDOW_MS);
  if (recent.length === 0) {
    return {
      status: { state: "ok", summary: "No lost queries in the last 10 min" },
      nextChangeAt: null,
    };
  }

  let oldestAt = recent[0]!.at;
  let newestAt = recent[0]!.at;
  for (const h of recent) {
    if (h.at < oldestAt) oldestAt = h.at;
    if (h.at > newestAt) newestAt = h.at;
  }
  return {
    status: { state: "attention", summary: lostSummary(recent, newestAt) },
    nextChangeAt: oldestAt + RECENT_WINDOW_MS,
  };
}
