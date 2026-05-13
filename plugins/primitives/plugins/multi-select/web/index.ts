import type { PluginDefinition } from "@core";

export { MultiSelectProvider } from "./internal/multi-select-provider";
export type { MultiSelectProviderProps } from "./internal/multi-select-provider";
export { useMultiSelect } from "./internal/use-multi-select";
export type { MultiSelectHandle } from "./internal/use-multi-select";
export { useMultiSelectItem } from "./internal/use-multi-select-item";
export type { MultiSelectItemHandle } from "./internal/use-multi-select-item";
export { SelectionBar } from "./internal/selection-bar";
export type { SelectionBarProps } from "./internal/selection-bar";
export { SelectionCheckbox } from "./internal/selection-checkbox";
export type { SelectionCheckboxProps } from "./internal/selection-checkbox";

export default {
  id: "multi-select",
  name: "Multi-Select",
  description:
    "Checkbox multi-select primitive: provider, hooks, and SelectionBar for list plugins.",
  contributions: [],
} satisfies PluginDefinition;
