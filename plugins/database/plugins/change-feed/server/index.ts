import {
  setRelationResolver,
  setFeedExemptTables,
  scopedResourceIdentities,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
import { db } from "@plugins/database/server";
import { relationIdentityBase } from "@plugins/database/plugins/derived-views/server";
import { feedExemptTables } from "@plugins/database/plugins/derived-tables/server";
import { rebuildTriggers } from "./internal/triggers";
import { excludedTableNames } from "./internal/exclusion";
import { assertNoDeadScopePolicies } from "./internal/identity-coverage";
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
  // Triggers are deterministic, data-less DDL rebuilt from the live schema on
  // every boot (like derived-views), NOT a migration. This runs in the blocking
  // barrier so the feed's triggers exist before any traffic — and the listener
  // (started in onReady, after the barrier) is guaranteed to find them.
  async onReadyBlocking() {
    await rebuildTriggers(db);
    // Reject dead scope policy: a keyed resource whose identityTable names an
    // excluded table can never receive its declared scoped delivery (the excluded
    // table has no trigger). Both inputs are authoritative here — contributions
    // were collected before this barrier, and the resource registry is populated
    // at module-import. Throws loudly (blocks boot) rather than warning: it is
    // always a definite bug, never transient drift. See ./internal/identity-coverage.
    assertNoDeadScopePolicies(scopedResourceIdentities(), excludedTableNames());
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
