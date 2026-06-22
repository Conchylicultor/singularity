import { applyDbChange } from "@plugins/framework/plugins/server-core/core";
import { relationIdentityBase } from "@plugins/database/plugins/derived-views/server";
import type { DbChange } from "./parse-payload";
import { dependentViews } from "./view-deps";

// Route one base-table change into the live-state recompute cascade. The change is
// applied directly (scoped via its ids), then expanded to every view that
// transitively depends on the table — because view-backed loaders record the VIEW
// in their read-set, not the base table. A view whose identity base IS the changed
// table (a 1:1 PK-preserving view, e.g. `conversations_v` ← `conversations`)
// forwards the SAME ids, so a scoped UPDATE stays scoped through it; every other
// view is FULL (its row identity does not map 1:1 to this base PK). Each apply is
// tagged with `origin` (the base table that actually changed) and `identityBase`
// (the identity of the relation being applied), so the runtime can deliver a
// covered change via a single path instead of letting a secondary-view FULL absorb
// the scoped one. `applyDbChange` is defensive (unknown/unread relation = no-op,
// never throws).
//
// This is the SINGLE source of change routing: the LISTEN consumer (live changes)
// AND the L2 cold-boot catch-up driver (replayed changelog rows) both call it, so
// "catch-up ≡ replay the missed rows as if they just arrived" is true by
// construction and can never drift from the live path. See
// research/2026-06-22-global-live-state-l2-persisted-materialization.md §3.5.
export function routeChange(change: DbChange): void {
  applyDbChange({ ...change, origin: change.table, identityBase: change.table });
  for (const view of dependentViews(change.table)) {
    const identityBase = relationIdentityBase(view);
    const forwardScoped = identityBase === change.table;
    applyDbChange({
      table: view,
      op: forwardScoped ? change.op : "U",
      ids: forwardScoped ? change.ids : null,
      origin: change.table,
      identityBase,
    });
  }
}
