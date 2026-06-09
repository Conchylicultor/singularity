import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Fields } from "./internal/slots";
export { FieldRenderer } from "./internal/field-renderer";
export { ConfigFieldContext } from "./internal/config-field-context";
export { FieldHeader } from "./components/field-header";
export { useLocalValue } from "./internal/use-local-value";
export type {
  FieldRendererProps,
  FieldRendererComponent,
} from "./internal/slots";

export default {
  description:
    "Field type registry. Sub-plugins contribute field types with core factories and web renderers.",
  contributions: [],
} satisfies PluginDefinition;
