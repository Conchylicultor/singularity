import {
  setRelationResolver,
  setFeedExemptTables,
  scopedResourceTables,
  routedTableRequirements,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
import { db, loadKnownRelations } from "@plugins/database/server";
import {
  BOOT_DDL_QUERY_DEADLINE_MS,
  withQueryDeadline,
} from "@plugins/database/plugins/connection/server";
import { ExcludeFromFork } from "@plugins/database/plugins/admin/server";
import { LIVE_STATE_CHANGELOG_TABLE } from "@plugins/database/plugins/derived-views/core";
import { relationIdentityBase } from "@plugins/database/plugins/derived-views/server";
import { feedExemptTables } from "@plugins/database/plugins/derived-tables/server";
import { excludedTableNames } from "./internal/exclusion";
import { installFeed } from "./internal/install-feed";
import {
  dropPendingProducerChanges,
  producedTableNames,
} from "./internal/producer";
import { startListener, stopListener } from "./internal/listener";
import { buildViewDeps } from "./internal/view-deps";

export { rebuildTriggers, getCoveredTables } from "./internal/triggers";
// Opt a high-churn observability table out of the L4 change-feed (see
// ./internal/exclusion for the trade this makes).
export { ExcludeFromChangeFeed } from "./internal/exclusion";
export { parseLiveStatePayload, readLayout } from "./internal/parse-payload";
export type { DbChange } from "./internal/parse-payload";
// The single source of change routing — reused by the L2 cold-boot catch-up
// driver (live-state-snapshot) so replay can never drift from the live LISTEN
// path. See research/2026-06-22-global-live-state-l2-persisted-materialization.md.
export { routeChange } from "./internal/route-change";
// What `routeChange` takes: every change states its source (the feed, or an
// in-process change producer).
export type {
  FeedChange,
  ProducerChange,
  RoutedChange,
} from "./internal/route-change";
// The in-process change source of a table the feed installs no trigger on: a
// producer owns its table's write verb (`mutate`) and routes the rows each
// statement returned. `changeProducerFor` lets a generic writer (retention) find
// a table's producer; `producedTableNames` is the mounted set (A6 in
// live-state-snapshot reads it).
export {
  changeProducerFor,
  defineChangeProducer,
  producedTableNames,
  PRODUCER_IDS_CAP,
} from "./internal/producer";
export type {
  ChangeProducer,
  ChangeProducerContribution,
  ChangeProducerOptions,
  ChangeProducerSpec,
  ProducerBuilder,
  ProducerExecutor,
  WriteLatency,
} from "./internal/producer";

export default {
  description:
    "L4 DB change-feed: STATEMENT-level Postgres triggers that pg_notify on every commit, plus a LISTEN consumer routing each change through the live-state recompute cascade — making missed invalidations structurally impossible and out-of-process writes visible. A table written only by this backend at high rate may instead declare an in-process change producer (defineChangeProducer): no trigger, its `mutate` owns the write and routes the returned ids, coalesced at the source and volatile.",
  contributions: [
    // The changelog is this feed's transactional OUTBOX — a bounded replay
    // buffer the L2 cold-boot catch-up reads to find what changed while a
    // backend was down. Its entries describe commits against the database that
    // produced them, and it is pruned against that database's own snapshot
    // watermark, so a fork inherits replay instructions for a history it does
    // not share. It is excluded together with `live_state_snapshot` (declared by
    // live-state-snapshot, which owns that table): catch-up compares the two, so
    // emptying one and not the other would leave the pair disagreeing.
    //
    // A table name string rather than a table object: the changelog is created
    // inside this plugin's own trigger-rebuild transaction, not by a drizzle
    // migration, so there is no table object to pass.
    ExcludeFromFork({
      table: LIVE_STATE_CHANGELOG_TABLE,
      reason:
        "Replay outbox describing commits against the source database, pruned against its own watermark; excluded together with live_state_snapshot.",
    }),
  ],
  // Triggers are deterministic, data-less DDL rebuilt from the live schema on
  // every boot (like derived-views), NOT a migration. This runs in the blocking
  // barrier so the feed's triggers exist before any traffic — and the listener
  // (started in onReady, after the barrier) is guaranteed to find them.
  async onReadyBlocking() {
    // The contributed exclusions and producers, read once here: contributions
    // were collected before this barrier. The routed tables' trigger layouts
    // and the resource tables are derived from every registered route —
    // resources register at module eval and deferred ones bind right after
    // contributions are collected, both before this barrier.
    const inputs = {
      exclusions: {
        feedExempt: feedExemptTables(),
        optedOut: excludedTableNames(),
        produced: producedTableNames(),
      },
      layouts: routedTableRequirements(),
      scoped: scopedResourceTables(),
    };
    // The trigger rebuild and the boot invariants it is checked against (A1′,
    // A2′, A3, A3p — see ./internal/install-feed). Per-table DROP+CREATE
    // TRIGGER can wait on the previous backend's readers during a hot-swap:
    // widen the query deadline for the install's own queries.
    await withQueryDeadline(
      {
        ms: BOOT_DDL_QUERY_DEADLINE_MS,
        reason: "boot: change-feed trigger rebuild",
      },
      () => installFeed(db, inputs),
    );
    // `installFeed` above creates `live_state_changelog`, which did not exist
    // yet when the database plugin took its own snapshot of the public relations.
    // Take it again so a loader naming the changelog unquoted is recognised too.
    // Idempotent, and it replaces the set wholesale.
    //
    // Here, in the blocking barrier, rather than in `onReady` below: `onReady`
    // runs after the barrier lifts, when the gateway may already be routing
    // traffic, and a loader running in that window would capture nothing.
    await loadKnownRelations(db);
  },
  // The LISTEN consumer is a background watcher, so it starts after the ready
  // barrier (same phase as git-watcher's startGitWatcher). The view-dependency
  // map is built here — by onReady the derived-views layer is rebuilt (it ran in
  // the database plugin's onReadyBlocking barrier), so the view→base-table graph
  // the listener uses to expand base-table changes onto view-backed resources is
  // complete and queryable.
  async onReady() {
    await buildViewDeps(db);
    // Inject the relation→identity-base resolver into server-core's live-state
    // runtime, so the read-set `_debug` ceiling resolves view-backed read-sets
    // into base-table space (matching `coveredOrigins`). change-feed is the wirer
    // because it already bridges the DB and live-state layers (importing both
    // barrels); derived-views stays a pure provider of `relationIdentityBase`,
    // and server-core never statically imports a feature plugin (no cycle).
    setRelationResolver(relationIdentityBase);
    // Inject the feed-exempt rollup tables (derived-tables) into the runtime's
    // _debug builder, so a trigger-maintained rollup a loader reads (e.g.
    // task_latest_conversation for agent-launches) is subtracted from the
    // emitted read-set and never shows as a false "silent FULL recompute".
    setFeedExemptTables(feedExemptTables);
    startListener();
  },
  async onShutdown() {
    // A producer's pending window must not fire into a runtime tearing down.
    dropPendingProducerChanges();
    await stopListener();
  },
} satisfies ServerPluginDefinition;
