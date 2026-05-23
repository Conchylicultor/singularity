import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { themeEngineConfig } from "../core";

export default {
  id: "ui-theme-engine",
  name: "UI: Theme Engine",
  contributions: [ConfigV2.Register({ descriptor: themeEngineConfig })],
} satisfies ServerPluginDefinition;
