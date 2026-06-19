import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { BackupSource } from "@plugins/backup/server";
import { attachmentsSourceConfig } from "../shared/config";
import { assembleAttachments } from "./internal/assemble-attachments";

export default {
  description: "Backs up file attachments into the backup archive.",
  contributions: [
    ConfigV2.Register({ descriptor: attachmentsSourceConfig }),
    BackupSource({
      id: "attachments",
      name: "Attachments",
      assemble: assembleAttachments,
    }),
  ],
} satisfies ServerPluginDefinition;
