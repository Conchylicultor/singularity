import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { shadowConfig } from "../shared";

export default {
  name: "UI: Shadow",
  contributions: [ConfigV2.Register({ descriptor: shadowConfig })],
} satisfies ServerPluginDefinition;
