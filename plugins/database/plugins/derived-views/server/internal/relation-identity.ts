import { getViewConfig } from "drizzle-orm/pg-core";
import { View } from "./contribution";

// Bridges the impedance mismatch between where changes ORIGINATE and where the
// read-set OBSERVES them. Triggers fire on base tables (you cannot put a row
// trigger on a view), and `coveredOrigins`/`identityTable` are likewise stated
// in BASE-TABLE space — but live-state loaders frequently read from the
// derived-views layer (`tasks_v`, `conversations_v`, …), so the L3 read-set
// records the VIEW name. Comparing a view-recording read-set against a
// base-table coveredOrigins set therefore mismatches on every healthy
// view-backed resource.
//
// `relationIdentityBase` maps a relation to its identity base table: a declared
// identity view (`View({ identityTable })`, a 1:1 PK-preserving view such as
// `conversations_v` ← `conversations`) maps to its base; any other relation
// (base table, or a view without a 1:1 base) is its own identity. This is the
// single owner of that map — derived-views owns the View registry it's built
// from. The change-feed (forwarding a scoped base change through a view) and the
// read-set debug ceiling (comparing like-for-like with coveredOrigins) both
// consume it.

// view name → its declared identity base table. Lazily built (and memoized)
// from the View registry the first time `relationIdentityBase` is called — by
// then all contributions are collected. A boot-time rebuild does not re-run it,
// but the View set is fixed at boot, so a once-built map is correct.
let identityByView: Map<string, string> | null = null;

function buildMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const { view, identityTable } of View.getContributions()) {
    if (identityTable) map.set(getViewConfig(view).name, identityTable);
  }
  return map;
}

// The identity base table of `relation`. A declared identity view (e.g.
// `conversations_v`) maps to its base (`conversations`); any other relation is
// its own identity. Pure lookup.
export function relationIdentityBase(relation: string): string {
  identityByView ??= buildMap();
  return identityByView.get(relation) ?? relation;
}
