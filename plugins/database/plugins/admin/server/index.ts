import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  getAdminPool,
  closeAdminPool,
  openShortLivedClient,
  connectionString,
} from "./internal/pool";
export {
  listDatabases,
  databaseExists,
  dropDatabase,
  ensureDatabase,
  countActiveConnections,
} from "./internal/databases";
export { forkDatabase } from "./internal/fork";
// A plugin declares "don't fork my data" for its own table / schema (see
// ./internal/fork-exclusion for the trade this makes); `forkExclusions` is the
// collected set every `forkDatabase` caller must pass.
export {
  ExcludeFromFork,
  ExcludeSchemaFromFork,
  forkExclusions,
} from "./internal/fork-exclusion";
export type { ForkExclusions } from "./internal/fork-exclusion";
export { forkTempPrefix } from "./internal/temp-name";
export { backupDatabase, inspectBackup } from "./internal/backup";
export type { BackupInfo, TableStat } from "./internal/backup";

export default {
  description:
    "Admin operations for the database plugin — fork, backup, drop, list.",
} satisfies ServerPluginDefinition;
