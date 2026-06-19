import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type {
  BackupArchive,
  BackupSourceReport,
  BackupTargetResult,
} from "@plugins/backup/core";

export const BackupTarget = defineServerContribution<{
  id: string;
  name: string;
  run: (archive: BackupArchive) => Promise<BackupTargetResult>;
}>("backup.target", { docLabel: (p) => p.name });

export const BackupSource = defineServerContribution<{
  id: string;
  name: string;
  assemble: (dir: string) => Promise<BackupSourceReport>;
}>("backup.source", { docLabel: (p) => p.name });
