import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { ListRenderer } from "./components/list-renderer";

export default {
  name: "Fields: List Config",
  description:
    "List field type: config-render capability (sortable drag-and-drop list for config-v2.fields.renderer) plus the listField factory.",
  contributions: [Fields.Renderer(ListRenderer)],
} satisfies PluginDefinition;
