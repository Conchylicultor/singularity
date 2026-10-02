import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { DynamicFlagsRenderer } from "./components/dynamic-flags-renderer";
import { DynamicFlags } from "./internal/slots";

export { DynamicFlags } from "./internal/slots";
export type {
  DynamicFlagOption,
  DynamicFlagsOptionsContribution,
} from "./internal/slots";

export default {
  description:
    "Dynamic flags field type: config-render capability (options and their defaults resolved at render time from slot contributions, drawn as toggle chips, for config-v2.fields.renderer) plus the dynamicFlagsField factory.",
  contributions: [Fields.Renderer(DynamicFlagsRenderer)],
  slots: DynamicFlags,
} satisfies PluginDefinition;
