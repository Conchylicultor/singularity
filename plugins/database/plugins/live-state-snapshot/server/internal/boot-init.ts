import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { setLiveStateSnapshotHooks } from "@plugins/framework/plugins/server-core/core";
import { seedReadSetIndex } from "@plugins/infra/plugins/runtime-profiler/core";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { ensureSnapshotTable } from "./tables-ddl";
import {
  shouldPersist,
  captureWatermark,
  persistSnapshot,
  readPersistedReadSets,
} from "./persist";

const log = Log.channel("live-state-snapshot", { persist: true });

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
