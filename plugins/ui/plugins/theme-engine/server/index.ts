import type { ServerPluginDefinition } from "@server/types";
import { Config } from "@plugins/config/server";
import { themeEngineConfig } from "../core";

export default {
  id: "ui-theme-engine",
  name: "UI: Theme Engine",
  contributions: [Config.Field(themeEngineConfig)],
} satisfies ServerPluginDefinition;
