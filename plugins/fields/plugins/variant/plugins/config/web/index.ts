import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { VariantRenderer } from "./components/variant-renderer";

export default {
  description:
    "Variant field type: config-render capability (type-dispatched renderer for config-v2.fields.renderer) plus the variantField factory.",
  contributions: [Fields.Renderer(VariantRenderer)],
} satisfies PluginDefinition;
