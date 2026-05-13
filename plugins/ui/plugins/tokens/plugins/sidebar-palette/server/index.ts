import type { ServerPluginDefinition } from "@server/types";
import { Config } from "@plugins/config/server";
import { sidebarPaletteConfig } from "@plugins/ui/plugins/tokens/plugins/sidebar-palette/shared";

export default {
  id: "ui-tokens-sidebar-palette",
  name: "UI: Sidebar Palette",
  contributions: [Config.Field(sidebarPaletteConfig)],
} satisfies ServerPluginDefinition;
