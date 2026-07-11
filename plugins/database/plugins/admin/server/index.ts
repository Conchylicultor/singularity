import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  getAdminPool,
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
export { forkTempPrefix } from "./internal/temp-name";
export { backupDatabase, inspectBackup } from "./internal/backup";
export type { BackupInfo, TableStat } from "./internal/backup";

export default {
  description: "Admin operations for the database plugin — fork, backup, drop, list.",
} satisfies ServerPluginDefinition;
