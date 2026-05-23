import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2, getConfig } from "@plugins/config_v2/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { backupConfig } from "../shared/config";
import { runBackup, listBackupRuns } from "../shared/endpoints";
import { backupRunJob } from "./internal/backup-job";
import { handleRun } from "./internal/handle-run";
import { handleList } from "./internal/handle-list";

export { BackupTarget } from "./internal/contribution";
export { _backupRuns } from "./internal/tables";

export default {
  id: "backup",
  name: "Backup",
  description:
    "Backup orchestrator: assembles archives from DB, secrets, and attachments, dispatches to registered storage targets.",
  httpRoutes: {
    [runBackup.route]: handleRun,
    [listBackupRuns.route]: handleList,
  },
  contributions: [ConfigV2.Register({ descriptor: backupConfig })],
  register: [backupRunJob],
  onReady: async () => {
    if (!isMain()) return;

    const { periodicIntervalHours } = getConfig(backupConfig);
    if (periodicIntervalHours > 0) {
      await backupRunJob.enqueue({ trigger: "periodic" });
    }
  },
} satisfies ServerPluginDefinition;
