import {
  applyLegacyFullChange,
  routeTableChange,
  type TableChange,
} from "@plugins/framework/plugins/server-core/core";
import type { ResourceRuntime } from "@plugins/framework/plugins/resource-runtime/core";
import type { DbChange } from "./parse-payload";

/** The two routers a change is delivered to (see `routeChange`). */
type ResourceRuntimeRouters = Pick<
  ResourceRuntime,
  "routeTableChange" | "applyLegacyFullChange"
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

// Route one base-table change into the live-state recompute cascade.
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
// per-tuple read-sets, host-id maps), `applyLegacyFullChange` every other one: a
// FULL recompute of each tracked tuple of every legacy resource whose read-set
// reaches the table through its relation bases (a view or rollup it read
// expands to the tables that feed it — `./relation-bases`), so a `conversations`
// write reaches a reader of `tasks_v`. Both carry the change's `source`. See
// research/2026-09-29-global-scoped-change-routing.md and
// research/2026-10-08-global-scoped-change-routing-p8-steps-23-24.md.
export const routeChange: (routed: RoutedChange) => void = createChangeRouter({
  routeTableChange,
  applyLegacyFullChange,
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
  const { routeTableChange, applyLegacyFullChange } = runtime;
  return (routed) => {
    const change = tableChangeOf(routed);
    // A routed table's trigger carries its key layout and, for a gated UPDATE,
    // the unchanged columns; every other table's leaves both null (unknown).
    routeTableChange(change);
    // `xid` (the source transaction — mutation-ack attribution) and the change's
    // wall clock forward to the legacy FULL too: it reads post-commit, so the
    // ackTx claim holds, and a view-backed list is late by the same amount as
    // the table that fed it.
    applyLegacyFullChange({
      table: change.table,
      source: change.source,
      ...(change.xid !== undefined ? { xid: change.xid } : {}),
      ...(change.changedAt !== undefined
        ? { changedAt: change.changedAt }
        : {}),
    });
  };
}
