import { fieldRendererSlot } from "./internal/slots";
import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Fields } from "./internal/slots";
export { FieldRenderer } from "./internal/field-renderer";
export { ConfigFieldContext } from "./internal/config-field-context";
export { ConfigFieldAdornmentsProvider } from "./internal/field-adornments";
export type { ConfigFieldAdornments } from "./internal/field-adornments";
export { useLocalValue } from "./internal/use-local-value";
export { defineFieldShape } from "./internal/define-field-shape";
export type { FieldRendererProps } from "./internal/slots";

export default {
  description:
    "Field type registry. Sub-plugins contribute field types with core factories and web renderers.",
  contributions: [],
  slots: { fieldRendererSlot: fieldRendererSlot },
} satisfies PluginDefinition;
