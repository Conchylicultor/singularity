import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { densityConfig } from "../shared";

export default {
  contributions: [ConfigV2.Register({ descriptor: densityConfig })],
} satisfies ServerPluginDefinition;
