import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { awaitDbReady, warmPool, db } from "./internal/client";
import { runMigrations } from "@plugins/database/plugins/migrations/server";
import { rebuildDerivedViews } from "@plugins/database/plugins/derived-views/server";

export { db, awaitDbReady, isTransientDbError } from "./internal/client";

export default {
  description:
    "Core database infrastructure. Connection pooling and DB readiness.",
  loadBearing: true,
  // Blocking: every other plugin's `onReady` (and incoming requests) must see a
  // migrated, warm DB. Running this in the `onReadyBlocking` barrier makes that
  // guarantee real and lets the gateway hold the hot-swap until migrations land.
  async onReadyBlocking() {
    await awaitDbReady();
    await warmPool();
    await runMigrations(db);
    // Plain views are derived code, not stateful migration schema: rebuild the
    // whole layer from source (in dependency order) after migrations apply, on
    // existing and fresh DBs alike. See
    // plugins/database/plugins/derived-views/CLAUDE.md.
    await rebuildDerivedViews(db);
  },
} satisfies ServerPluginDefinition;
