import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { BackupSource } from "@plugins/backup/server";
import { claudeSettingsSourceConfig } from "../shared/config";
import { assembleClaudeSettings } from "./internal/assemble-claude-settings";

export default {
  description: "Backs up Claude CLI settings and history into the backup archive.",
  contributions: [
    ConfigV2.Register({ descriptor: claudeSettingsSourceConfig }),
    BackupSource({
      id: "claude-settings",
      name: "Claude Settings",
      assemble: assembleClaudeSettings,
    }),
  ],
} satisfies ServerPluginDefinition;
