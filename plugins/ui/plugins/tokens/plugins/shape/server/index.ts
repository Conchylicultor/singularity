import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Config } from "@plugins/config/server";
import { shapeConfig } from "../shared";

export default {
  id: "ui-tokens-shape",
  name: "UI: Shape",
  contributions: [Config.Field(shapeConfig)],
} satisfies ServerPluginDefinition;
