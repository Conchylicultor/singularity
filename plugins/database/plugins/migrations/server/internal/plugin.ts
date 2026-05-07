import type { ServerPluginDefinition } from "@server/types";

const plugin: ServerPluginDefinition = {
  id: "database-migrations",
  name: "Database Migrations",
  description: "DDL lifecycle: migration runner and SQL files.",
};
export default plugin;
