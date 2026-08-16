import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { BackupSource } from "@plugins/backup/server";
import { prototypesSourceConfig } from "../shared/config";
import { assemblePrototypes } from "./internal/assemble-prototypes";

export default {
  description:
    "Backs up the throwaway UI prototypes into the backup archive — they live outside git on purpose, so this is what makes them recoverable.",
  contributions: [
    ConfigV2.Register({ descriptor: prototypesSourceConfig }),
    BackupSource({
      id: "prototypes",
      name: "Prototypes",
      assemble: assemblePrototypes,
    }),
  ],
} satisfies ServerPluginDefinition;
