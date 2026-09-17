import { db } from "@plugins/database/server";
import {
  defineRetention,
  markCascadeBounded,
} from "@plugins/infra/plugins/retention/server";
import { RAW_RETENTION_DAYS } from "../../core";
import { rolledUpDays } from "./aggregate-sql";
import type { AnalyticsDb } from "./collect";
import { analyticsHits, analyticsVisits } from "./tables";

// Hits are reclaimed with their visit.
markCascadeBounded(analyticsHits, analyticsVisits);

/**
 * Refuse to delete raw visits of a day that has no daily totals: once raw rows
 * are gone they can never be summed, so deleting first would lose the day for
 * good. Throwing leaves the rows for the next sweep, after the rollup heals.
 */
export async function assertDaysRolledUp(
  dbx: AnalyticsDb,
  days: readonly string[],
): Promise<void> {
  const unique = [...new Set(days)].sort();
  const done = await rolledUpDays(dbx, unique);
  const missing = unique.filter((day) => !done.has(day));
  if (missing.length > 0) {
    throw new Error(
      `analytics retention: refusing to delete raw visits of days with no daily totals (${missing.join(", ")}) — the rollup has not summed them`,
    );
  }
}

/**
 * Per-visit rows live {@link RAW_RETENTION_DAYS} days; the daily totals are kept
 * forever. `perWorktree: true` for the same reason as the rollup: a deployed
 * release is never main, and only perWorktree crons install there.
 */
export const analyticsVisitsRetention = defineRetention({
  table: analyticsVisits,
  column: "startedAt",
  ttlDays: RAW_RETENTION_DAYS,
  perWorktree: true,
  beforeDelete: (rows) =>
    assertDaysRolledUp(
      db,
      rows.map((row) => row.day),
    ),
});
