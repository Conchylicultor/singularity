import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { backupConfig } from "../shared/config";
import { runBackup, listBackupRuns } from "../shared/endpoints";
import { backupRunJob } from "./internal/backup-job";
import { handleRun } from "./internal/handle-run";
import { handleList } from "./internal/handle-list";
import { reconcileBackups } from "./internal/reconcile-backups";

export { BackupSource, BackupTarget } from "./internal/contribution";
export { _backupRuns } from "./internal/tables";

export default {
  description:
    "Backup orchestrator: assembles archives from registered backup sources, dispatches to registered storage targets.",
  httpRoutes: {
    [runBackup.route]: handleRun,
    [listBackupRuns.route]: handleList,
  },
  contributions: [ConfigV2.Register({ descriptor: backupConfig })],
  onReady: async () => {
    // BACKUPS_DIR is host-global; only the main runtime owns backup lifecycle.
    if (isMain()) await reconcileBackups();
  },
  // backupRunJob declares `schedule` (driven by backupConfig.periodicCron) —
  // the jobs worker seeds its cron item at startup. No onReady enqueue needed.
  // The schedule is main-only by default (it isn't `perWorktree`), so the
  // backup runs once per tick on the main runtime regardless of how many
  // worktrees are up — the cron is never installed in worktree workers.
  register: [backupRunJob],
} satisfies ServerPluginDefinition;
