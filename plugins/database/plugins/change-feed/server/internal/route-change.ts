import {
  applyDbChange,
  routeTableChange,
  type TableChange,
} from "@plugins/framework/plugins/server-core/core";
import type { ResourceRuntime } from "@plugins/framework/plugins/resource-runtime/core";
import { relationIdentityBase } from "@plugins/database/plugins/derived-views/server";
import type { DbChange } from "./parse-payload";
import { dependentViews } from "./view-deps";

/** The two routers a change is delivered to (see `routeChange`). */
type ResourceRuntimeRouters = Pick<
  ResourceRuntime,
  "routeTableChange" | "applyDbChange"
>;

/** A change from the Postgres feed: a NOTIFY, a catch-up row, a reconnect sweep. */
export type FeedChange = TableChange & { source: "feed" };

/**
 * A change from an in-process change producer (`defineChangeProducer`): the
 * ids its own statement returned, and nothing else. It has no key layout (a
 * produced table carries none — A3p), no `unchanged` set (it compares nothing),
 * and no source transaction (nobody is owed an ack), so it cannot state them.
 */
export interface ProducerChange {
  source: "producer";
  table: string;
  op: "U" | "D";
  /** The returned PKs, or `null` over the producer's id cap (FULL per tuple). */
  ids: readonly string[] | null;
  /** The earliest buffered emit's wall clock (see `PendingNotify.changedAt`). */
  changedAt: number;
}

/** What `routeChange` routes: every change source states which one it is. */
export type RoutedChange = FeedChange | ProducerChange;

/**
 * A parsed NOTIFY payload or changelog row as the feed change it is. A null
 * `xid` / `changedAt` (a pre-upgrade NOTIFY, a replay row) is omitted.
 */
export function feedChange(change: DbChange): FeedChange {
  return {
    source: "feed",
    table: change.table,
    op: change.op,
    ids: change.ids,
    keys: change.keys,
    unchanged: change.unchanged,
    ...(change.xid !== null ? { xid: change.xid } : {}),
    ...(change.changedAt !== null ? { changedAt: change.changedAt } : {}),
  };
}

// The router's input for either source: a producer change reads as a feed
// change that knows nothing of keys or unchanged columns.
function tableChangeOf(change: RoutedChange): TableChange {
  return change.source === "feed"
    ? change
    : {
        source: "producer",
        table: change.table,
        op: change.op,
        ids: change.ids,
        keys: null,
        unchanged: null,
        changedAt: change.changedAt,
      };
}

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
// This is the SINGLE source of change routing: the LISTEN consumer (live changes),
// the L2 cold-boot catch-up driver (replayed changelog rows) AND the in-process
// change producers (`./producer`) all call it, so "catch-up ≡ replay the missed
// rows as if they just arrived" is true by construction and can never drift from
// the live path, and a produced table reaches its readers exactly as a triggered
// one would. See
// research/2026-06-22-global-live-state-l2-persisted-materialization.md §3.5.
//
// Two routers read each change, and each resource is served by exactly one of
// them: `routeTableChange` serves the ROUTED resources (compiler-emitted routes —
// per-tuple read-sets, host-id maps), `applyDbChange` every other one through the
// read-set inversion, which skips routed keys. Both carry the change's `source`.
// See research/2026-09-29-global-scoped-change-routing.md.
export const routeChange: (routed: RoutedChange) => void = createChangeRouter({
  routeTableChange,
  applyDbChange,
});

/**
 * The routing above, into ANY runtime's two routers — `routeChange` is it
 * bound to server-core's process-global runtime. A suite that registers real
 * declarations on a runtime of its own (`createResourceRuntime`: the tree
 * oracle) routes its feed through this, so it never registers a key on the
 * global registry a barrel's module eval already registered it on.
 */
export function createChangeRouter(
  runtime: ResourceRuntimeRouters,
): (routed: RoutedChange) => void {
  const { routeTableChange, applyDbChange } = runtime;
  return (routed) => {
    const change = tableChangeOf(routed);
    // `xid` (the source transaction — mutation-ack attribution) forwards on BOTH
    // applies: even a view-fanout FULL recompute reads post-commit, so the ackTx
    // claim survives the scope degrade. The change's wall clock forwards on both
    // applies too: a view-backed list is late by the same amount as the table
    // that fed it.
    const attribution = {
      source: change.source,
      ...(change.xid !== undefined ? { xid: change.xid } : {}),
      ...(change.changedAt !== undefined
        ? { changedAt: change.changedAt }
        : {}),
    };
    // A routed table's trigger carries its key layout and, for a gated UPDATE,
    // the unchanged columns; every other table's leaves both null (unknown).
    routeTableChange(change);
    applyDbChange({
      table: change.table,
      op: change.op,
      ids: change.ids,
      origin: change.table,
      identityBase: change.table,
      ...attribution,
    });
    for (const view of dependentViews(change.table)) {
      const identityBase = relationIdentityBase(view);
      const forwardScoped = identityBase === change.table;
      applyDbChange({
        table: view,
        op: forwardScoped ? change.op : "U",
        ids: forwardScoped ? change.ids : null,
        origin: change.table,
        identityBase,
        ...attribution,
      });
    }
  };
}
