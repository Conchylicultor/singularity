import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Config } from "@plugins/config/web";
import { localBackupConfig } from "../shared/config";

export default {
  id: "backup-local",
  name: "Backup: Local",
  description: "Config UI for local backup target.",
  contributions: [Config.Spec(localBackupConfig)],
} satisfies PluginDefinition;
