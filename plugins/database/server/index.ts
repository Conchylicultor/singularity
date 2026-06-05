import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { awaitDbReady, warmPool, db } from "./internal/client";
import { runMigrations } from "@plugins/database/plugins/migrations/server";

export { db, awaitDbReady, isTransientDbError } from "./internal/client";

export default {
  name: "Database",
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
  },
} satisfies ServerPluginDefinition;
