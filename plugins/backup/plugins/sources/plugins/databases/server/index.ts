import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { BackupSource } from "@plugins/backup/server";
import { databasesSourceConfig } from "../shared/config";
import { assembleDatabases } from "./internal/assemble-databases";

export default {
  description: "Backs up worktree databases into the backup archive.",
  contributions: [
    ConfigV2.Register({ descriptor: databasesSourceConfig }),
    BackupSource({
      id: "databases",
      name: "Databases",
      assemble: assembleDatabases,
    }),
  ],
} satisfies ServerPluginDefinition;
