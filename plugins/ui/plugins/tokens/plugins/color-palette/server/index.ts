import type { ServerPluginDefinition } from "@server/types";
import { colorPaletteConfig } from "../shared";

export default {
  id: "ui-tokens-color-palette",
  name: "UI: Color Palette",
  config: colorPaletteConfig,
} satisfies ServerPluginDefinition;
