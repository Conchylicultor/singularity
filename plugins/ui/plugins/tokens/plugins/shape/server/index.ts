import type { ServerPluginDefinition } from "@server/types";
import { Config } from "@plugins/config/server";
import { shapeConfig } from "../internal";

export default {
  id: "ui-tokens-shape",
  name: "UI: Shape",
  contributions: [Config.Field(shapeConfig)],
} satisfies ServerPluginDefinition;
