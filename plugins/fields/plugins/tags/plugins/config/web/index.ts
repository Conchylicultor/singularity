import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { TagsRenderer } from "./components/tags-renderer";

export default {
  description:
    "Tags field type: config-render capability. Contributes the multi-select chip renderer to the config-v2.fields.renderer slot.",
  contributions: [Fields.Renderer(TagsRenderer)],
} satisfies PluginDefinition;
