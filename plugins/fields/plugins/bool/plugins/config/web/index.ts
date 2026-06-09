import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { BoolRenderer } from "./components/bool-renderer";

export default {
  description:
    "Boolean field type: config-render capability (checkbox for config-v2.fields.renderer) plus the boolField factory.",
  contributions: [Fields.Renderer(BoolRenderer)],
} satisfies PluginDefinition;
