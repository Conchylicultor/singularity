import type { ServerPluginDefinition } from "@server/types";
import { sidebarPaletteConfig } from "../shared";

export default {
  id: "ui-tokens-sidebar-palette",
  name: "UI: Sidebar Palette",
  config: sidebarPaletteConfig,
} satisfies ServerPluginDefinition;
