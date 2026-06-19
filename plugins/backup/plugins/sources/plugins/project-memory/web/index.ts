import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { projectMemorySourceConfig } from "../shared/config";

export default {
  description: "Config UI for the project memory backup source.",
  contributions: [ConfigV2.WebRegister({ descriptor: projectMemorySourceConfig })],
} satisfies PluginDefinition;
