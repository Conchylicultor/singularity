import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { ListRenderer } from "./components/list-renderer";

export default {
  name: "Config v2: List Field",
  description: "Sortable list field type with stable UUID identity and fractional-index ordering.",
  contributions: [Fields.Renderer(ListRenderer)],
} satisfies PluginDefinition;
