import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { StringListRenderer } from "./components/string-list-renderer";

export default {
  name: "Config v2: String List Field",
  description: "Plain string-array field type.",
  contributions: [Fields.Renderer(StringListRenderer)],
} satisfies PluginDefinition;
