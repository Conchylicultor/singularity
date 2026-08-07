import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { BackupSource } from "@plugins/backup/server";
import { costHistorySourceConfig } from "../shared/config";
import { assembleCostHistory } from "./internal/assemble-cost-history";

export default {
  description: "Backs up the permanent cost-history archive (year-sharded session records and the merged price table) into the backup archive.",
  contributions: [
    ConfigV2.Register({ descriptor: costHistorySourceConfig }),
    BackupSource({
      id: "cost-history",
      name: "Cost History",
      assemble: assembleCostHistory,
    }),
  ],
} satisfies ServerPluginDefinition;
