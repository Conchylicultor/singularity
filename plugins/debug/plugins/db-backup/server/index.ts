import type { ServerPluginDefinition } from "@server/types";
import { handleBackup } from "./internal/handle-backup";
import { listBackups } from "./internal/list-backups";

export default {
  id: "debug-db-backup",
  name: "DB Backup",
  description: "Backup non-worktree Postgres databases to ~/.backups/singularity/.",
  httpRoutes: {
    "GET /api/debug/backup-db": listBackups,
    "POST /api/debug/backup-db": handleBackup,
  },
} satisfies ServerPluginDefinition;
