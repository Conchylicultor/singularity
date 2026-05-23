import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { shapeConfig } from "../shared";

export default {
  id: "ui-tokens-shape",
  name: "UI: Shape",
  contributions: [ConfigV2.Register({ descriptor: shapeConfig })],
} satisfies ServerPluginDefinition;
