import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { BackupSource } from "@plugins/backup/server";
import { secretsSourceConfig } from "../shared/config";
import { assembleSecrets } from "./internal/assemble-secrets";

export default {
  description: "Backs up encrypted secrets into the backup archive.",
  contributions: [
    ConfigV2.Register({ descriptor: secretsSourceConfig }),
    BackupSource({
      id: "secrets",
      name: "Secrets",
      assemble: assembleSecrets,
    }),
  ],
} satisfies ServerPluginDefinition;
