import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { typographyConfig } from "../shared";

export default {
  contributions: [ConfigV2.Register({ descriptor: typographyConfig })],
} satisfies ServerPluginDefinition;
