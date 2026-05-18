import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  openShortLivedClient,
  connectionString,
} from "./internal/pool";
export { listDatabases, databaseExists, dropDatabase } from "./internal/databases";
export { forkDatabase } from "./internal/fork";
export { backupDatabase, inspectBackup } from "./internal/backup";
export type { BackupInfo, TableStat } from "./internal/backup";

export default {
  id: "database-admin",
  name: "Database Admin",
  description: "Admin operations for the database plugin — fork, backup, drop, list.",
} satisfies ServerPluginDefinition;
