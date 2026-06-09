import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { TextRenderer } from "./components/text-renderer";

export default {
  description:
    "Text field type: config-render capability (single-line input for config-v2.fields.renderer) plus the textField factory.",
  contributions: [Fields.Renderer(TextRenderer)],
} satisfies PluginDefinition;
