import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { SecretRenderer } from "./components/secret-renderer";

export default {
  description:
    "Secret field type: config-render capability (password input for config-v2.fields.renderer) plus the secretField factory.",
  contributions: [Fields.Renderer(SecretRenderer)],
} satisfies PluginDefinition;
