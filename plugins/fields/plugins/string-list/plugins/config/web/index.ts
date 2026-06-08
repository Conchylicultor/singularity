import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { StringListRenderer } from "./components/string-list-renderer";

export default {
  name: "Fields: String List Config",
  description:
    "String-list field type: config-render capability (one-item-per-line textarea for config-v2.fields.renderer) plus the stringListField factory.",
  contributions: [Fields.Renderer(StringListRenderer)],
} satisfies PluginDefinition;
