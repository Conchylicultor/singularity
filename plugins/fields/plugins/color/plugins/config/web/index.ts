import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { ColorRenderer } from "./components/color-renderer";

export default {
  name: "Fields: Color Config",
  description:
    "Color field type: config-render capability (hex/oklch popover picker for config-v2.fields.renderer) plus the colorField factory.",
  contributions: [Fields.Renderer(ColorRenderer)],
} satisfies PluginDefinition;
