import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { BackupTarget } from "@plugins/backup/server";
import { googleDriveBackupConfig } from "../shared/config";
import { runGoogleDriveTarget } from "./internal/run-target";

export default {
  id: "backup-google-drive",
  name: "Backup: Google Drive",
  description: "Uploads backup archives to Google Drive.",
  contributions: [
    ConfigV2.Register({ descriptor: googleDriveBackupConfig }),
    BackupTarget({
      id: "google-drive",
      name: "Google Drive",
      run: runGoogleDriveTarget,
    }),
  ],
} satisfies ServerPluginDefinition;
