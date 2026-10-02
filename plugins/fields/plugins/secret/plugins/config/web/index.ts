import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { secretSample } from "../core";
import { SecretRenderer } from "./components/secret-renderer";

export default {
  description:
    "Secret field type: config-render capability (password input for config-v2.fields.renderer) plus the secretField factory.",
  contributions: [Fields.Renderer(SecretRenderer), Fields.Sample(secretSample)],
} satisfies PluginDefinition;
