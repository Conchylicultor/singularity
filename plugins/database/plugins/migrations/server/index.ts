import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  runMigrations,
  migrationsReady,
  dryRunPendingMigrations,
} from "./internal/runner";

export default {
  description: "DDL lifecycle: migration runner and SQL files.",
} satisfies ServerPluginDefinition;
