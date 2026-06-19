import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { BackupSource } from "@plugins/backup/server";
import { transcriptsSourceConfig } from "../shared/config";
import { assembleTranscripts } from "./internal/assemble-transcripts";

export default {
  description: "Backs up active-conversation transcripts into the backup archive.",
  contributions: [
    ConfigV2.Register({ descriptor: transcriptsSourceConfig }),
    BackupSource({
      id: "transcripts",
      name: "Transcripts",
      assemble: assembleTranscripts,
    }),
  ],
} satisfies ServerPluginDefinition;
