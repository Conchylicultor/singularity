import { getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";

// A plugin opts ITS OWN table out of the L4 change-feed by adding
// `ExcludeFromChangeFeed({ table, reason })` to its server `contributions`.
// The change-feed installs no INSERT/UPDATE/DELETE trigger on an excluded table,
// so a write never fires pg_notify, never appends a `live_state_changelog` row,
// and never drives a live-state recompute.
//
// WHEN TO USE THIS — and the trade you are making. The change-feed's value is
// that missed invalidations are *structurally impossible*: every committed write
// invalidates whatever live-state resource reads it, with zero hand-wiring. By
// excluding a table you give that up FOR THAT TABLE — any resource that reads it
// becomes hydrate-on-mount (it loads current truth when a client subscribes, but
// no longer live-updates while open). That is the correct trade for **high-churn
// observability counters** (deduped slow-op / crash aggregates that UPDATE a hot
// row thousands of times a minute): wiring per-statement live-UI invalidation
// onto them turns a debug pane nobody is staring at into the single largest
// source of changelog churn + notify cascade in the whole system — instrumentation
// that costs more than what it instruments. It is the WRONG trade for any table
// backing a user-facing live surface. `reason` is required so the decision is a
// reviewed, documented one, not a silent staleness footgun.
//
// Collected by the framework at boot BEFORE any onReadyBlocking runs (same as the
// `View` contribution), so `rebuildTriggers` sees every exclusion regardless of
// module import order.
//
// INVARIANT (enforced at boot by ./identity-coverage): no keyed live-state
// resource may declare an `identityTable` on an excluded table. Scoped delivery
// fires only on `origin === identityTable`, which an excluded (trigger-less) table
// can never produce — so the policy would be dead config that silently degrades
// the resource to hydrate-on-mount. A resource that reads an excluded table must
// be a plain push resource (no identityTable), like reportsResource/slowOpsResource.
export const ExcludeFromChangeFeed = defineServerContribution<{
  table: PgTable;
  reason: string;
}>("change-feed-exclusion");

// The set of pg relation names contributed for exclusion. The drizzle table
// object is passed (not a magic string) so a table rename is refactor-safe and a
// typo is a tsc error; we derive the pg name here.
export function excludedTableNames(): Set<string> {
  return new Set(
    ExcludeFromChangeFeed.getContributions().map((c) => getTableName(c.table)),
  );
}
