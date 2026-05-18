import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Config } from "@plugins/config/server";
import { sidebarPaletteConfig } from "../shared";

export default {
  id: "ui-tokens-sidebar-palette",
  name: "UI: Sidebar Palette",
  contributions: [Config.Field(sidebarPaletteConfig)],
} satisfies ServerPluginDefinition;
