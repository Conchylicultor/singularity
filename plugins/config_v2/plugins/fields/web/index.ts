import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Fields } from "./internal/slots";
export { FieldRenderer } from "./internal/field-renderer";
export { ConfigFieldContext } from "./internal/config-field-context";
export type {
  FieldRendererProps,
  FieldRendererComponent,
} from "./internal/slots";

export default {
  name: "Config v2: Fields",
  description:
    "Field type registry. Sub-plugins contribute field types with core factories and web renderers.",
  contributions: [],
} satisfies PluginDefinition;
