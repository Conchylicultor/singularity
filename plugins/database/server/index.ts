import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { awaitDbReady, db } from "./internal/client";
import { runMigrations } from "@plugins/database/plugins/migrations/server";

export { db, awaitDbReady, isTransientDbError } from "./internal/client";

export default {
  id: "database",
  name: "Database",
  description:
    "Core database infrastructure. Connection pooling and DB readiness.",
  loadBearing: true,
  async onReady() {
    await awaitDbReady();
    await runMigrations(db);
  },
} satisfies ServerPluginDefinition;
