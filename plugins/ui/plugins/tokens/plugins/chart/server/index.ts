import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { chartConfig } from "../shared";

export default {
  name: "UI: Chart",
  contributions: [ConfigV2.Register({ descriptor: chartConfig })],
} satisfies ServerPluginDefinition;
