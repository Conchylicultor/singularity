import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { transcriptsSourceConfig } from "../shared/config";

export default {
  description: "Config UI for the transcripts backup source.",
  contributions: [ConfigV2.WebRegister({ descriptor: transcriptsSourceConfig })],
} satisfies PluginDefinition;
