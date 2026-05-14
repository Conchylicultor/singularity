import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useEditableField } from "./use-editable-field";
export type { EditableField, UseEditableFieldOptions } from "./use-editable-field";

export default {
  id: "editable-field",
  name: "Editable Field",
  description:
    "Debounced-autosave field hook with focus tracking, flush-on-blur, and self-echo suppression. Used by task/agent detail forms.",
  contributions: [],
} satisfies PluginDefinition;
