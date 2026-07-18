import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  setLiveStateSnapshotHooks,
  boundedMembershipKeys,
} from "@plugins/framework/plugins/server-core/core";
import { seedReadSetIndex } from "@plugins/infra/plugins/runtime-profiler/core";
import { ensureSnapshotTable } from "./tables-ddl";
import {
  shouldPersist,
  bootCriticalKeys,
  captureWatermark,
  persistSnapshot,
  readPersistedReadSets,
  clearSnapshotsExceptKeys,
} from "./persist";
import { snapshotLog as log } from "./log-sink";

// Install the L2 snapshot subsystem during the `onReadyBlocking` barrier: create
// the snapshot table, inject the persist hooks into the resource runtime, and seed
// the read-set index from the durable `tables_read` column — all before the
// readiness flag flips (so a persist can never fire with the hooks unset, and
// catch-up's first `applyDbChange` sees a non-empty table→resource inversion).
//
// This is a GRACEFUL-DEGRADATION hook. The snapshot layer is a cold-boot
// *accelerator*, not a correctness prerequisite: if it can't initialize, the
// resources simply full-recompute in `onReady` (correct, just a colder boot). But
// `onReadyBlocking` throws are fatal by contract (a barrier that doesn't complete
// must abort boot — see server-core `ServerPluginDefinition.onReadyBlocking`), so
// the degradation MUST be made explicit right here rather than leaked to the
// framework: catch, log loudly, and continue with the hooks simply not installed.
// Letting this throw escape would crash the backend over an optional optimization.
export async function initSnapshotSubsystem(db: NodePgDatabase): Promise<void> {
  try {
    await ensureSnapshotTable(db);
    // Sweep stale snapshots BEFORE seeding the read-set index or serving a boot
    // snapshot: evict every persisted row whose key is no longer persistable, so a
    // leftover from a prior boot (a resource migrated to a bounded window/point, or
    // one whose `bootCritical` was dropped) can't be served as a stale value via the
    // L2 fast path. The persistable set is exactly the runtime's own persist gate —
    // bootCritical AND NOT membership-bounded (read off the definition-derived
    // predicates, never a hardcoded name). One bounded DELETE; a no-op when clean.
    const keepKeys = [...bootCriticalKeys()].filter(
      (k) => !new Set(boundedMembershipKeys()).has(k),
    );
    const swept = await clearSnapshotsExceptKeys(db, keepKeys);
    if (swept > 0) {
      log.publish(`swept ${swept} stale snapshot row(s) for non-persistable key(s)`, "stdout");
    }
    setLiveStateSnapshotHooks({
      shouldPersist,
      captureWatermark: () => captureWatermark(db),
      persistSnapshot: (key, paramsKey, value, watermark, tablesRead) =>
        persistSnapshot(db, key, paramsKey, value, watermark, tablesRead),
    });
    // Only non-empty read-sets are seeded; an empty one means "no usable read-set"
    // → force-FULL in onReady.
    const persistedReadSets = await readPersistedReadSets(db);
    const seed: Record<string, string[]> = {};
    for (const [key, tables] of persistedReadSets) {
      if (tables.length > 0) seed[key] = tables;
    }
    seedReadSetIndex(seed);
  } catch (err) {
    const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
    // Loud but non-fatal: cold-boot acceleration is off for this boot; correctness
    // is preserved by the full recompute in onReady. console.error surfaces it in
    // the per-worktree backend boot log; the persisted channel surfaces it in the
    // Debug → Logs pane.
    console.error(
      `[live-state-snapshot] L2 snapshot init failed; degrading to cold recompute`,
      msg,
    );
    log.publish(
      `L2 snapshot subsystem init failed; degrading to cold recompute (no persisted snapshots this boot): ${msg}`,
      "stderr",
    );
  }
}
