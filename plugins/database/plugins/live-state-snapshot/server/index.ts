import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  setLiveStateSnapshotHooks,
  recomputeResource,
} from "@plugins/framework/plugins/server-core/core";
import { seedReadSetIndex } from "@plugins/infra/plugins/runtime-profiler/core";
import { db } from "@plugins/database/server";
import { ensureSnapshotTable } from "./internal/tables-ddl";
import {
  shouldPersist,
  captureWatermark,
  persistSnapshot,
  readPersistedReadSets,
  bootCriticalKeys,
} from "./internal/persist";
import { runCatchUp } from "./internal/catch-up";
import { liveStateChangelogPruneJob } from "./internal/prune";

// L2 persisted materialization. Owns the `live_state_snapshot` table (the durable
// materialized value), injects the runtime's persist hooks, runs the bounded
// cold-boot catch-up, and registers the changelog prune job. The `live_state_changelog`
// table (the transactional outbox) is owned by change-feed (it writes it from the
// trigger function). See
// research/2026-06-22-global-live-state-l2-persisted-materialization.md.
export { readPersistedSnapshots, clearPersistedSnapshots } from "./internal/persist";

export default {
  description:
    "L2 persisted live-state materialization: durable snapshot + xmin watermark for instant cold boot, with a bounded changelog catch-up that recomputes only the resources whose tables changed during downtime.",
  loadBearing: false,
  register: [liveStateChangelogPruneJob],
  // Create the snapshot table and INJECT the persist hooks into the resource
  // runtime here — before the ready barrier flips and before any flush could try
  // to persist. The `onReadyBlocking` phase is graph-driven by `dependsOn`, and
  // this plugin imports `db` (→ `dependsOn` edge to `database`), so this hook runs
  // AFTER `database`'s `onReadyBlocking` (which awaits `awaitDbReady` + runs the
  // migrations) — the DB is live and migrated by the time we read/write the
  // snapshot. The changelog table is created by change-feed's own onReadyBlocking
  // (rebuildTriggers), inside its trigger-rebuild txn; we never touch it here.
  //
  // The hooks read the boot-injected holder lazily, so installing them now (rather
  // than racing onReady) means a persist can never fire with the holder unset.
  async onReadyBlocking() {
    await ensureSnapshotTable(db);
    setLiveStateSnapshotHooks({ shouldPersist, captureWatermark, persistSnapshot });
    // Seed the in-memory loader→table read-set index from the durable
    // `tables_read` column BEFORE the readiness barrier flips — so the
    // table→resource inversion (`tableToResources`) is non-empty for catch-up's
    // first `applyDbChange`, with NO loader run at boot. Only non-empty read-sets
    // are seeded; an empty one means "no usable read-set" → force-FULL in onReady.
    const persistedReadSets = await readPersistedReadSets();
    const seed: Record<string, string[]> = {};
    for (const [key, tables] of persistedReadSets) {
      if (tables.length > 0) seed[key] = tables;
    }
    seedReadSetIndex(seed);
  },
  // Boot init + bounded catch-up, after the barrier (alongside change-feed's
  // listener, which also starts in onReady).
  async onReady() {
    // Force a FULL recompute of each boot-critical resource that has NO usable
    // persisted read-set yet (first boot, newly-added resource, or the one-time
    // migration of pre-existing snapshot rows): catch-up can't bound such a
    // resource (no read-set to route by, possibly no snapshot floor). The
    // recompute persists both its value AND its read-set for the next boot. On a
    // steady-state deploy `needsInit` is empty → no forced recomputes. Boot-
    // critical keys are read GENERICALLY from `Resource.Declare` (never by name).
    const usable = await readPersistedReadSets();
    for (const key of bootCriticalKeys()) {
      if (!usable.get(key)?.length) recomputeResource(key);
    }

    // ORDERING INVARIANT (gap-free boot): `runCatchUp()` MUST run AFTER the
    // change-feed listener's LISTEN is established, so any commit landing after
    // catch-up's `SELECT` produces a NOTIFY on the live path (double-handling is
    // harmless — catch-up is an idempotent recompute+diff). This holds
    // structurally: live-state-snapshot statically imports change-feed
    // (`routeChange`, table constants) → a dependsOn edge → its `onReady` fires
    // after change-feed's `onReady` (which calls `startListener()`). Do NOT remove
    // that import edge without re-establishing the ordering another way. See the
    // plan's "Ordering invariant" section.
    await runCatchUp();
  },
} satisfies ServerPluginDefinition;
