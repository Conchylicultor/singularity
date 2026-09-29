import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  applySchemaLayer,
  migrationsReady,
  dryRunPendingMigrations,
  listMigrationFiles,
  planSchemaSteps,
} from "./internal/runner";
export type {
  Migration,
  SchemaLayerInputs,
  SchemaPlan,
  SchemaStep,
} from "./internal/runner";

export default {
  description: "DDL lifecycle: migration runner and SQL files.",
} satisfies ServerPluginDefinition;
