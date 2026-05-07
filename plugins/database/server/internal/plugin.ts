import type { ServerPluginDefinition } from "@server/types";
import { adminPool, awaitPgReady, db } from "./client";
import { runMigrations } from "@plugins/database/plugins/migrations/server";
import { setAdminPool } from "@plugins/database/plugins/embedded/server";

const plugin: ServerPluginDefinition = {
  id: "database",
  name: "Database",
  description:
    "Core database infrastructure. Connection pooling and PG readiness.",
  loadBearing: true,
  async onReady() {
    await awaitPgReady();
    setAdminPool(adminPool);
    await runMigrations(db);
  },
};
export default plugin;
