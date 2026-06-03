import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { colorAdjustConfig } from "../shared";

export default {
  name: "UI: Color Adjust",
  contributions: [ConfigV2.Register({ descriptor: colorAdjustConfig })],
} satisfies ServerPluginDefinition;
