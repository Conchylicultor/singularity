import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  setLiveStateSnapshotHooks,
  boundedMembershipKeys,
  seedReadSetIndex,
} from "@plugins/framework/plugins/server-core/core";
import { ensureSnapshotTable } from "./tables-ddl";
import {
  shouldPersist,
  preloadedKeys,
  captureWatermark,
  persistSnapshot,
  readPersistedReadSets,
  clearSnapshotsExceptKeys,
  clearPersistedSnapshots,
} from "./persist";
import {
  createProducedPersistGuard,
  sweepProducedSnapshots,
} from "./produced-guard";
import { snapshotLog as log } from "./log-sink";
import { producedPersistReports } from "./produced-reports";

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
//
// `produced` is the set of tables fed by an in-process change producer (A6, see
// ./produced-guard): a persisted row reading one is swept here, and a persist
// whose read-set names one is refused for the life of the process.
export async function initSnapshotSubsystem(
  db: NodePgDatabase,
  produced: ReadonlySet<string>,
): Promise<void> {
  try {
    await ensureSnapshotTable(db);
    // Sweep stale snapshots BEFORE seeding the read-set index or serving a boot
    // snapshot: evict every persisted row whose key is no longer persistable, so a
    // leftover from a prior boot (a resource migrated to a bounded window/point, or
    // one whose `preload` was dropped) can't be served as a stale value via the
    // L2 fast path. The persistable set is exactly the runtime's own persist gate —
    // preloaded AND NOT membership-bounded (read off the definition-derived
    // predicates, never a hardcoded name). One bounded DELETE; a no-op when clean.
    const keepKeys = [...preloadedKeys()].filter(
      (k) => !new Set(boundedMembershipKeys()).has(k),
    );
    const swept = await clearSnapshotsExceptKeys(db, keepKeys);
    if (swept > 0) {
      log.publish(
        `swept ${swept} stale snapshot row(s) for non-persistable key(s)`,
        "stdout",
      );
    }
    // A6 (stale rows): a persisted value over a produced table may predate the
    // code that stopped persisting it — delete it (before the read-set seed
    // below can index it), and say so once.
    const sweptProduced = await sweepProducedSnapshots(db, produced);
    if (sweptProduced.length > 0) {
      reportProducedPersist(
        `deleted ${sweptProduced.length} stale L2 snapshot row(s) that read a produced table: ${sweptProduced
          .map(
            (r) =>
              `${r.resource_key} (${r.tables_read.filter((t) => produced.has(t)).join(", ")})`,
          )
          .join("; ")}`,
      );
    }
    // A6 (runtime): a persist whose read-set names a produced table is refused,
    // and its key never writes a row again in this process. The persist GATE
    // below stays the plain `shouldPersist` — the runtime assumes it fixed for
    // the process, so the guard drops the write, never the key's persistedness.
    const guard = createProducedPersistGuard({
      produced,
      onRefused: async (key, tables) => {
        // Never served again: drop the row a previous persist left.
        await clearPersistedSnapshots(db, [key]);
        reportProducedPersist(
          `refused to persist "${key}": its read-set names produced table(s) ${tables.join(", ")} — the key writes no row again in this process`,
        );
      },
    });
    setLiveStateSnapshotHooks({
      shouldPersist,
      captureWatermark: () => captureWatermark(db),
      persistSnapshot: async (key, paramsKey, value, watermark, tablesRead) => {
        if (await guard.refuses(key, tablesRead)) return;
        await persistSnapshot(db, key, paramsKey, value, watermark, tablesRead);
      },
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

// One A6 report: the boot sweep and the runtime refusal each file at most one
// per key. Logged at once; filed through a HELD sink, because both can fire
// before the reports plugin installs server-core's error reporter (the sweep
// runs in `onReadyBlocking`, a refusal can follow `onReady`'s forced
// recomputes) — `reportServerError` itself drops a report with no reporter.
function reportProducedPersist(message: string): void {
  log.publish(`[live-state-snapshot] A6: ${message}`, "stderr");
  producedPersistReports.emit(`[live-state-snapshot] A6: ${message}`);
}
