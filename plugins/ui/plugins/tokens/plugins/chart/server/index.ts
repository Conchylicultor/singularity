import type { ServerPluginDefinition } from "@server/types";
import { Config } from "@plugins/config/server";
import { chartConfig } from "../shared";

export default {
  id: "ui-tokens-chart",
  name: "UI: Chart",
  contributions: [Config.Field(chartConfig)],
} satisfies ServerPluginDefinition;
