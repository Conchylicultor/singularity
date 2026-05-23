import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { SecretRenderer } from "./components/secret-renderer";

export default {
  id: "config-v2-fields-secret",
  name: "Config v2: Secret Field",
  description: "Secret field type: encrypted storage with set/not-set metadata.",
  contributions: [Fields.Renderer(SecretRenderer)],
} satisfies PluginDefinition;
