import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Config } from "@plugins/config/server";
import { colorPaletteConfig } from "../shared";

export default {
  id: "ui-tokens-color-palette",
  name: "UI: Color Palette",
  contributions: [Config.Field(colorPaletteConfig)],
} satisfies ServerPluginDefinition;
