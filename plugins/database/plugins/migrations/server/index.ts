import type { ServerPluginDefinition } from "@server/types";

export { runMigrations } from "./internal/runner";

export default {
  id: "database-migrations",
  name: "Database Migrations",
  description: "DDL lifecycle: migration runner and SQL files.",
} satisfies ServerPluginDefinition;
