import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { googleDriveBackupConfig } from "../shared/config";

export default {
  id: "backup-google-drive",
  name: "Backup: Google Drive",
  description: "Config UI for Google Drive backup target.",
  contributions: [ConfigV2.WebRegister({ descriptor: googleDriveBackupConfig })],
} satisfies PluginDefinition;
