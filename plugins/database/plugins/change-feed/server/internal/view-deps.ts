import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql as drizzleSql } from "drizzle-orm";

// Bridges the impedance mismatch between where changes ORIGINATE and where the
// read-set OBSERVES them. Triggers fire on base tables (you cannot put a row
// trigger on a view), but live-state loaders frequently read from the
// derived-views layer (`tasks_v`, `attempts_v`, …) — so the L3 read-set records
// the VIEW name, not the base table. A write to `tasks` would otherwise map to
// no resource, because the resources read `tasks_v`.
//
// This module computes, once at boot (after derived-views are rebuilt), the
// transitive closure base-relation → every view that (directly or via
// views-on-views) depends on it. The listener uses it to expand a base-table
// change into the dependent views, so view-backed resources are invalidated too.

// relation name → views that DIRECTLY reference it (a view referencing another
// view produces an edge here, so the closure below handles views-on-views).
let directDependents: Map<string, Set<string>> = new Map();

export async function buildViewDeps(db: NodePgDatabase): Promise<void> {
  const res = await db.execute<{ view_name: string; table_name: string }>(
    drizzleSql.raw(
      `SELECT view_name, table_name
       FROM information_schema.view_table_usage
       WHERE view_schema = 'public'`,
    ),
  );
  const map = new Map<string, Set<string>>();
  for (const { view_name, table_name } of res.rows) {
    let set = map.get(table_name);
    if (!set) {
      set = new Set();
      map.set(table_name, set);
    }
    set.add(view_name);
  }
  directDependents = map;
}

// Every view that transitively depends on `relation` (excluding `relation`
// itself). A change to a base table must invalidate resources reading any of
// these views. Empty when nothing depends on the relation (the common case for
// tables no view selects from).
export function dependentViews(relation: string): string[] {
  const out = new Set<string>();
  const stack = [relation];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const view of directDependents.get(cur) ?? []) {
      if (!out.has(view)) {
        out.add(view);
        stack.push(view);
      }
    }
  }
  return [...out];
}
