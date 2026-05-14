import type { ServerPluginDefinition } from "@server/types";
import { Config } from "@plugins/config/server";
import { BackupTarget } from "@plugins/backup/server";
import { localBackupConfig } from "../shared/config";
import { runLocalTarget } from "./internal/run-local-target";

export default {
  id: "backup-local",
  name: "Backup: Local",
  description: "Stores backup archives on the local filesystem.",
  contributions: [
    Config.Field(localBackupConfig),
    BackupTarget({
      id: "local",
      name: "Local",
      run: runLocalTarget,
    }),
  ],
} satisfies ServerPluginDefinition;
