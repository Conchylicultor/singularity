import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { prototypesSourceConfig } from "../shared/config";

export default {
  description: "Config UI for the prototypes backup source.",
  contributions: [ConfigV2.WebRegister({ descriptor: prototypesSourceConfig })],
} satisfies PluginDefinition;
