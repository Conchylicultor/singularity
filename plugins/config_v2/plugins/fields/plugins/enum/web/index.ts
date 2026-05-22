import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { EnumRenderer } from "./components/enum-renderer";

export default {
  id: "config-v2-fields-enum",
  name: "Config v2: Enum Field",
  description: "Enum field type: single-choice from a fixed set of options.",
  contributions: [Fields.Renderer(EnumRenderer)],
} satisfies PluginDefinition;
