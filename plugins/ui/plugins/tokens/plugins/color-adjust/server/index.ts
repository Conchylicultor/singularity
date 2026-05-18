import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Config } from "@plugins/config/server";
import { colorAdjustConfig } from "../shared";

export default {
  id: "ui-tokens-color-adjust",
  name: "UI: Color Adjust",
  contributions: [Config.Field(colorAdjustConfig)],
} satisfies ServerPluginDefinition;
