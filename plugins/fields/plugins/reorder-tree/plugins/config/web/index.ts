import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { ReorderTreeRenderer } from "./components/reorder-tree-renderer";

export default {
  description:
    "Reorder-tree field type: config-render capability (read-only tree list for config-v2.fields.renderer) plus the reorderTreeField factory.",
  contributions: [Fields.Renderer(ReorderTreeRenderer)],
} satisfies PluginDefinition;
