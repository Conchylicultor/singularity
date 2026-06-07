import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { DynamicEnumRenderer } from "./components/dynamic-enum-renderer";

export { DynamicEnum } from "./internal/slots";
export type {
  DynamicEnumOption,
  DynamicEnumOptionsContribution,
} from "./internal/slots";

export default {
  name: "Fields: Dynamic Enum Config",
  description:
    "Dynamic enum field type: config-render capability (options resolved at render time from slot contributions, for config-v2.fields.renderer) plus the dynamicEnumField factory.",
  contributions: [Fields.Renderer(DynamicEnumRenderer)],
} satisfies PluginDefinition;
