import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { ColorRenderer } from "./components/color-renderer";

export default {
  id: "config-v2-fields-color",
  name: "Config v2: Color Field",
  description: "Color field type: hex color string with a popover color picker.",
  contributions: [Fields.Renderer(ColorRenderer)],
} satisfies PluginDefinition;
