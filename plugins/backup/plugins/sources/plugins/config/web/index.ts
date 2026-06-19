import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { configSourceConfig } from "../shared/config";

export default {
  description: "Config UI for the config backup source.",
  contributions: [ConfigV2.WebRegister({ descriptor: configSourceConfig })],
} satisfies PluginDefinition;
