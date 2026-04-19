import type { ServerPluginDefinition } from "../../../../../server/src/types";
import { handleBackup } from "./internal/handle-backup";

const plugin: ServerPluginDefinition = {
  id: "debug-db-backup",
  name: "DB Backup",
  description: "Backup non-worktree Postgres databases to ~/.backups/singularity/.",
  httpRoutes: {
    "POST /api/debug/backup-db": handleBackup,
  },
};

export default plugin;
