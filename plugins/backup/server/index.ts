import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { backupConfig } from "../shared/config";
import { runBackup } from "../shared/endpoints";
import { backupRunJob } from "./internal/backup-job";
import { backupScheduleJob } from "./internal/backup-schedule";
import { backupTask } from "./internal/backup-task";
import { handleRun } from "./internal/handle-run";
import { reconcileBackups } from "./internal/reconcile-backups";

export { BackupSource, BackupTarget } from "./internal/contribution";
export { _backupRuns } from "./internal/tables";

export default {
  description:
    "Backup orchestrator: assembles archives from registered backup sources, dispatches to registered storage targets. The assembly runs OUT OF PROCESS as a supervised task, so a backend restart mid-`tar` no longer kills the backup.",
  httpRoutes: {
    [runBackup.route]: handleRun,
  },
  contributions: [ConfigV2.Register({ descriptor: backupConfig })],
  onReady: async () => {
    // BACKUPS_DIR is host-global; only the main runtime owns backup lifecycle.
    // A filesystem sweep only — closing rows belongs to the supervised job now.
    if (isMain()) await reconcileBackups();
  },
  // Three tokens, one per thing that has to exist by name at runtime:
  //   - `backupRunJob` mounts BOTH the queue job and its supervised-run kind,
  //     which is what makes the kind reconcilable after a restart;
  //   - `backupTask` puts `backup.run` in the task registry, which is what
  //     `./singularity supervised-exec` resolves in the child;
  //   - `backupScheduleJob` is the cron tick, separate because a scheduled job
  //     must be `dedup: "singleton"` and a supervised one must not — see its
  //     own file.
  register: [backupRunJob, backupTask, backupScheduleJob],
} satisfies ServerPluginDefinition;
