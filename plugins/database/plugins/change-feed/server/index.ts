import {
  setRelationResolver,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
import { db } from "@plugins/database/server";
import { relationIdentityBase } from "@plugins/database/plugins/derived-views/server";
import { rebuildTriggers } from "./internal/triggers";
import { startListener, stopListener } from "./internal/listener";
import { buildViewDeps } from "./internal/view-deps";

export { rebuildTriggers, getCoveredTables } from "./internal/triggers";
export { parseLiveStatePayload } from "./internal/parse-payload";
export type { DbChange } from "./internal/parse-payload";

export default {
  description:
    "L4 DB change-feed: STATEMENT-level Postgres triggers that pg_notify on every commit, plus a LISTEN consumer routing each change through the live-state recompute cascade — making missed invalidations structurally impossible and out-of-process writes visible.",
  // Triggers are deterministic, data-less DDL rebuilt from the live schema on
  // every boot (like derived-views), NOT a migration. This runs in the blocking
  // barrier so the feed's triggers exist before any traffic — and the listener
  // (started in onReady, after the barrier) is guaranteed to find them.
  async onReadyBlocking() {
    await rebuildTriggers(db);
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
    startListener();
  },
  async onShutdown() {
    await stopListener();
  },
} satisfies ServerPluginDefinition;
