import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { MultilineTextRenderer } from "./components/multiline-text-renderer";

export default {
  description:
    "Long-text field type: config-render capability (textarea for config-v2.fields.renderer) plus the multilineTextField factory.",
  contributions: [Fields.Renderer(MultilineTextRenderer)],
} satisfies PluginDefinition;
