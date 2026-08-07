import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { costHistorySourceConfig } from "../shared/config";

export default {
  description: "Config UI for the cost-history backup source.",
  contributions: [ConfigV2.WebRegister({ descriptor: costHistorySourceConfig })],
} satisfies PluginDefinition;
