import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Config } from "@plugins/config/web";
import { googleDriveBackupConfig } from "../shared/config";

export default {
  id: "backup-google-drive",
  name: "Backup: Google Drive",
  description: "Config UI for Google Drive backup target.",
  contributions: [Config.Spec(googleDriveBackupConfig)],
} satisfies PluginDefinition;
