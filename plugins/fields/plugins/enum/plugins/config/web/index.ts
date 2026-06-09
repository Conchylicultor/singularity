import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { EnumRenderer } from "./components/enum-renderer";

export default {
  description:
    "Enum field type: config-render capability. Contributes the radio/dropdown renderer to the config-v2.fields.renderer slot.",
  contributions: [Fields.Renderer(EnumRenderer)],
} satisfies PluginDefinition;
