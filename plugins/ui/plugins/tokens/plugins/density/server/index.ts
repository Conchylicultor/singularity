import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { densityConfig } from "../shared";

export default {
  id: "ui-tokens-density",
  name: "UI: Density",
  contributions: [ConfigV2.Register({ descriptor: densityConfig })],
} satisfies ServerPluginDefinition;
