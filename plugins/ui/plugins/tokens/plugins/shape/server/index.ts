import type { ServerPluginDefinition } from "@server/types";
import { Config } from "@plugins/config/server";
import { shapeConfig } from "@plugins/ui/plugins/tokens/plugins/shape/shared";

export default {
  id: "ui-tokens-shape",
  name: "UI: Shape",
  contributions: [Config.Field(shapeConfig)],
} satisfies ServerPluginDefinition;
