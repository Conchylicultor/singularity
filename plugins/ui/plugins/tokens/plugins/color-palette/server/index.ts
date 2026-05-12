import type { ServerPluginDefinition } from "@server/types";
import { Config } from "@plugins/config/server";
import { colorPaletteConfig } from "../internal";

export default {
  id: "ui-tokens-color-palette",
  name: "UI: Color Palette",
  contributions: [Config.Field(colorPaletteConfig)],
} satisfies ServerPluginDefinition;
