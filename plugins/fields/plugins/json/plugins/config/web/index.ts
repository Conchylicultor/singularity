import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { JsonRenderer } from "./components/json-renderer";

export default {
  description:
    "JSON field type: config-render capability (read-only formatted JSON for config-v2.fields.renderer) plus the jsonField factory.",
  contributions: [Fields.Renderer(JsonRenderer)],
} satisfies PluginDefinition;
