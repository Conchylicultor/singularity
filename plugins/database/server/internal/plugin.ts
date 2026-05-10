import type { ServerPluginDefinition } from "@server/types";
import { awaitDbReady, db } from "./client";
import { runMigrations } from "@plugins/database/plugins/migrations/server";

const plugin: ServerPluginDefinition = {
  id: "database",
  name: "Database",
  description:
    "Core database infrastructure. Connection pooling and DB readiness.",
  loadBearing: true,
  async onReady() {
    await awaitDbReady();
    await runMigrations(db);
  },
};
export default plugin;
