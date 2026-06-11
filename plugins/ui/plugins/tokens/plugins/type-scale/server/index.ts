import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { typeScaleConfig } from "../shared";

export default {
  contributions: [ConfigV2.Register({ descriptor: typeScaleConfig })],
} satisfies ServerPluginDefinition;
