import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { setLiveStateSnapshotHooks } from "@plugins/framework/plugins/server-core/core";
import { awaitDbReady, db } from "@plugins/database/server";
import { migrationsReady } from "@plugins/database/plugins/migrations/server";
import { ensureSnapshotTable } from "./internal/tables-ddl";
import {
  shouldPersist,
  captureWatermark,
  persistSnapshot,
} from "./internal/persist";
import { runCatchUp } from "./internal/catch-up";
import { liveStateChangelogPruneJob } from "./internal/prune";

// L2 persisted materialization. Owns the `live_state_snapshot` table (the durable
// materialized value), injects the runtime's persist hooks, runs the bounded
// cold-boot catch-up, and registers the changelog prune job. The `live_state_changelog`
// table (the transactional outbox) is owned by change-feed (it writes it from the
// trigger function). See
// research/2026-06-22-global-live-state-l2-persisted-materialization.md.
export { readPersistedSnapshots } from "./internal/persist";

export default {
  description:
    "L2 persisted live-state materialization: durable snapshot + xmin watermark for instant cold boot, with a bounded changelog catch-up that recomputes only the resources whose tables changed during downtime.",
  loadBearing: false,
  register: [liveStateChangelogPruneJob],
  // Create the snapshot table and INJECT the persist hooks into the resource
  // runtime here — before the ready barrier flips and before any flush could try
  // to persist. `onReadyBlocking` hooks run in PARALLEL, so we explicitly await
  // `awaitDbReady` + `migrationsReady` (the snapshot read/write needs a live DB).
  // The changelog table is created by change-feed's own onReadyBlocking
  // (rebuildTriggers), inside its trigger-rebuild txn; we never touch it here.
  //
  // The hooks read the boot-injected holder lazily, so installing them now (rather
  // than racing onReady) means a persist can never fire with the holder unset.
  async onReadyBlocking() {
    await awaitDbReady();
    await migrationsReady;
    await ensureSnapshotTable(db);
    setLiveStateSnapshotHooks({ shouldPersist, captureWatermark, persistSnapshot });
  },
  // Bounded catch-up runs after the barrier (alongside change-feed's listener,
  // which also starts in onReady). It replays the changelog rows committed since
  // the oldest persisted snapshot floor through the SAME `routeChange` cascade the
  // live listener uses — converging every persisted resource whose tables changed
  // while the server was down, and nothing else.
  async onReady() {
    await runCatchUp();
  },
} satisfies ServerPluginDefinition;
