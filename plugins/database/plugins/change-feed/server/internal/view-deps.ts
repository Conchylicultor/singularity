import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql as drizzleSql } from "drizzle-orm";
import { z } from "zod";
import { executeRows } from "@plugins/database/plugins/sql-rows/core";

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
// The relation→identity-base map lives in derived-views (which owns the View
// registry it's built from); see `relationIdentityBase`.

// relation name → views that DIRECTLY reference it (a view referencing another
// view produces an edge here, so the closure below handles views-on-views).
let directDependents: Map<string, Set<string>> = new Map();

// `information_schema.view_table_usage` types its name columns as the
// `sql_identifier` domain, which Postgres resolves to its base type on the wire —
// a scalar `name` (OID 19), which pg decodes to a string. Measured, not assumed.
const ViewUsageRowSchema = z.object({
  view_name: z.string(),
  table_name: z.string(),
});

export async function buildViewDeps(db: NodePgDatabase): Promise<void> {
  const rows = await executeRows(db, {
    query: drizzleSql.raw(
      `SELECT view_name, table_name
       FROM information_schema.view_table_usage
       WHERE view_schema = 'public'`,
    ),
    row: ViewUsageRowSchema,
    label: "buildViewDeps",
  });
  const map = new Map<string, Set<string>>();
  for (const { view_name, table_name } of rows) {
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
