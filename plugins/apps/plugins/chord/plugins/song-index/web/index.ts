import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { songIndexConfig } from "../shared/config";

export default {
  description: "Settings registration for the song index's load scope.",
  contributions: [ConfigV2.WebRegister({ descriptor: songIndexConfig })],
} satisfies PluginDefinition;
