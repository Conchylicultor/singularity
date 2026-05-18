import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { runMigrations } from "./internal/runner";

export default {
  id: "database-migrations",
  name: "Database Migrations",
  description: "DDL lifecycle: migration runner and SQL files.",
} satisfies ServerPluginDefinition;
