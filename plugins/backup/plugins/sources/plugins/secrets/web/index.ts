import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { secretsSourceConfig } from "../shared/config";

export default {
  description: "Config UI for the secrets backup source.",
  contributions: [ConfigV2.WebRegister({ descriptor: secretsSourceConfig })],
} satisfies PluginDefinition;
