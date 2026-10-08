import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { flushAppUsageEndpoint, type AppUsageEntry } from "../../core";
import { _appUsageDaily } from "./tables";

/**
 * One batch's entries folded to one per (day, app): a single `INSERT … ON
 * CONFLICT DO UPDATE` may not touch the same row twice, and a batch restored
 * after a failed flush can repeat a key.
 */
export function mergeEntries(
  entries: readonly AppUsageEntry[],
): AppUsageEntry[] {
  const byKey = new Map<string, AppUsageEntry>();
  for (const e of entries) {
    const key = `${e.day}:${e.appId}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...e });
      continue;
    }
    prev.launches += e.launches;
    prev.focusedMs += e.focusedMs;
    if (
      e.lastOpenedAt !== null &&
      (prev.lastOpenedAt === null || e.lastOpenedAt > prev.lastOpenedAt)
    )
      prev.lastOpenedAt = e.lastOpenedAt;
  }
  return [...byKey.values()];
}

export const handleFlushAppUsage = implement(
  flushAppUsageEndpoint,
  async ({ body }) => {
    const rows = mergeEntries(body.entries).map((e) => ({
      usageKey: `${e.day}:${e.appId}`,
      day: e.day,
      appId: e.appId,
      launches: e.launches,
      focusedMs: e.focusedMs,
      lastOpenedAt: e.lastOpenedAt === null ? null : new Date(e.lastOpenedAt),
    }));
    // ONE additive upsert for the whole batch: on conflict `_appUsageDaily.<col>`
    // is the existing row and `excluded.<col>` this batch's delta, so concurrent
    // flushes (two windows) sum instead of racing. `greatest` ignores NULLs.
    await db
      .insert(_appUsageDaily)
      .values(rows)
      .onConflictDoUpdate({
        target: _appUsageDaily.usageKey,
        set: {
          launches: sql`${_appUsageDaily.launches} + excluded.launches`,
          focusedMs: sql`${_appUsageDaily.focusedMs} + excluded.focused_ms`,
          lastOpenedAt: sql`greatest(${_appUsageDaily.lastOpenedAt}, excluded.last_opened_at)`,
          lastFlushedAt: sql`now()`,
        },
      });
  },
);
