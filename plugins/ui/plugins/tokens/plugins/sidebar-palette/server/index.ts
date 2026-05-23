import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { sidebarPaletteConfig } from "../shared";

export default {
  id: "ui-tokens-sidebar-palette",
  name: "UI: Sidebar Palette",
  contributions: [ConfigV2.Register({ descriptor: sidebarPaletteConfig })],
} satisfies ServerPluginDefinition;
