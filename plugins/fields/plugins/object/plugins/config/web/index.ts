import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { ObjectRenderer } from "./components/object-renderer";

export default {
  name: "Fields: Object Config",
  description:
    "Object field type: config-render capability (collapsible sub-field renderer for config-v2.fields.renderer) plus the objectField factory.",
  contributions: [Fields.Renderer(ObjectRenderer)],
} satisfies PluginDefinition;
