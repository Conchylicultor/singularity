import { defineServerContribution } from "@server/contributions";
import type { BackupArchive, BackupTargetResult } from "@plugins/backup/core";

export const BackupTarget = defineServerContribution<{
  id: string;
  name: string;
  run: (archive: BackupArchive) => Promise<BackupTargetResult>;
}>("backup.target", { docLabel: (p) => p.name });
