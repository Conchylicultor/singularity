import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { StringListRenderer } from "./components/string-list-renderer";

export default {
  description:
    "String-list field type: config-render capability (drag-and-drop string list for config-v2.fields.renderer) plus the stringListField factory.",
  contributions: [Fields.Renderer(StringListRenderer)],
} satisfies PluginDefinition;
