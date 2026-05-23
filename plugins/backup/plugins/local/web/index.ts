import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { localBackupConfig } from "../shared/config";

export default {
  id: "backup-local",
  name: "Backup: Local",
  description: "Config UI for local backup target.",
  contributions: [ConfigV2.WebRegister({ descriptor: localBackupConfig })],
} satisfies PluginDefinition;
