import type { ServerPluginDefinition } from "../../../../../server/src/types";
import { handleBackup } from "./internal/handle-backup";

export default {
  id: "debug-db-backup",
  name: "DB Backup",
  description: "Backup non-worktree Postgres databases to ~/.backups/singularity/.",
  httpRoutes: {
    "POST /api/debug/backup-db": handleBackup,
  },
} satisfies ServerPluginDefinition;
