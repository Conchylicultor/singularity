import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Config } from "@plugins/config/server";
import { typographyConfig } from "../shared";

export default {
  id: "ui-tokens-typography",
  name: "UI: Typography",
  contributions: [Config.Field(typographyConfig)],
} satisfies ServerPluginDefinition;
