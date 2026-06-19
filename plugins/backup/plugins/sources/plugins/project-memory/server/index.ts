import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { BackupSource } from "@plugins/backup/server";
import { projectMemorySourceConfig } from "../shared/config";
import { assembleProjectMemory } from "./internal/assemble-project-memory";

export default {
  description: "Backs up Claude Code project memory files into the backup archive.",
  contributions: [
    ConfigV2.Register({ descriptor: projectMemorySourceConfig }),
    BackupSource({
      id: "project-memory",
      name: "Project Memory",
      assemble: assembleProjectMemory,
    }),
  ],
} satisfies ServerPluginDefinition;
