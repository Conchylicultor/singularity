import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Config } from "@plugins/config/server";
import { shadowConfig } from "../shared";

export default {
  id: "ui-tokens-shadow",
  name: "UI: Shadow",
  contributions: [Config.Field(shadowConfig)],
} satisfies ServerPluginDefinition;
