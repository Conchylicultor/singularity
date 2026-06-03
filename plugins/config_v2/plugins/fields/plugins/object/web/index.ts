import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { ObjectRenderer } from "./components/object-renderer";

export default {
  name: "Config v2: Object Field",
  description:
    "Object field type: fixed-structure named sub-fields grouped into a single value.",
  contributions: [Fields.Renderer(ObjectRenderer)],
} satisfies PluginDefinition;
