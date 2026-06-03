import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Fields } from "@plugins/config_v2/plugins/fields/web";
import { DynamicEnumRenderer } from "./components/dynamic-enum-renderer";

export { DynamicEnum } from "./internal/slots";
export type {
  DynamicEnumOption,
  DynamicEnumOptionsContribution,
} from "./internal/slots";

export default {
  name: "Config v2: Dynamic Enum Field",
  description:
    "Dynamic enum field type: options resolved at render time from slot contributions.",
  contributions: [Fields.Renderer(DynamicEnumRenderer)],
} satisfies PluginDefinition;
