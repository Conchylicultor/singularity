import type { ServerPluginDefinition } from "@server/types";
import { Config } from "@plugins/config/server";
import { colorPaletteConfig } from "@plugins/ui/plugins/tokens/plugins/color-palette/shared";

export default {
  id: "ui-tokens-color-palette",
  name: "UI: Color Palette",
  contributions: [Config.Field(colorPaletteConfig)],
} satisfies ServerPluginDefinition;
