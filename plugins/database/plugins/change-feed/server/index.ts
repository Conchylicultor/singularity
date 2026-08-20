import {
  setRelationResolver,
  setFeedExemptTables,
  scopedResourceIdentities,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
import { db } from "@plugins/database/server";
import { ExcludeFromFork } from "@plugins/database/plugins/admin/server";
import { LIVE_STATE_CHANGELOG_TABLE } from "@plugins/database/plugins/derived-views/core";
import { relationIdentityBase } from "@plugins/database/plugins/derived-views/server";
import { feedExemptTables } from "@plugins/database/plugins/derived-tables/server";
import { rebuildTriggers, getCoveredTables } from "./internal/triggers";
import { excludedTableNames } from "./internal/exclusion";
import { assertScopePoliciesCovered } from "./internal/identity-coverage";
import { startListener, stopListener } from "./internal/listener";
import { buildViewDeps } from "./internal/view-deps";

export {
  rebuildTriggers,
  getCoveredTables,
  ensureChangelogTable,
} from "./internal/triggers";
// Opt a high-churn observability table out of the L4 change-feed (see
// ./internal/exclusion for the trade this makes).
export { ExcludeFromChangeFeed } from "./internal/exclusion";
export { parseLiveStatePayload } from "./internal/parse-payload";
export type { DbChange } from "./internal/parse-payload";
// The single source of change routing — reused by the L2 cold-boot catch-up
// driver (live-state-snapshot) so replay can never drift from the live LISTEN
// path. See research/2026-06-22-global-live-state-l2-persisted-materialization.md.
export { routeChange } from "./internal/route-change";

export default {
  description:
    "L4 DB change-feed: STATEMENT-level Postgres triggers that pg_notify on every commit, plus a LISTEN consumer routing each change through the live-state recompute cascade — making missed invalidations structurally impossible and out-of-process writes visible.",
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
    await rebuildTriggers(db);
    // Reject dead scope policy: a keyed resource whose identityTable names a table
    // the feed installed no trigger on can never receive its declared scoped
    // delivery (scoped fires only on origin === identityTable, and only a
    // triggered table produces that origin). `getCoveredTables()` is the single
    // authoritative set — just populated by `rebuildTriggers` above — so this one
    // check subsumes the ExcludeFromChangeFeed case AND catches typo / view /
    // rollup / nonexistent identity tables; the exclusion + exempt sets only
    // classify the reason for the diagnostic. All inputs are authoritative here —
    // contributions were collected before this barrier and the resource registry
    // is populated at module-import. Throws loudly (blocks boot) rather than
    // warning: it is always a definite bug, never transient drift. A legitimate
    // base table is present in the covered set by construction, so a miss is never
    // a false positive. See ./internal/identity-coverage.
    assertScopePoliciesCovered(
      scopedResourceIdentities(),
      new Set(getCoveredTables()),
      excludedTableNames(),
      new Set(feedExemptTables()),
    );
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
    await stopListener();
  },
} satisfies ServerPluginDefinition;
