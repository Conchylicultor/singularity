import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { BackupTarget } from "@plugins/backup/server";
import { localBackupConfig } from "../shared/config";
import { runLocalTarget } from "./internal/run-local-target";

export default {
  id: "backup-local",
  name: "Backup: Local",
  description: "Stores backup archives on the local filesystem.",
  contributions: [
    ConfigV2.Register({ descriptor: localBackupConfig }),
    BackupTarget({
      id: "local",
      name: "Local",
      run: runLocalTarget,
    }),
  ],
} satisfies ServerPluginDefinition;
