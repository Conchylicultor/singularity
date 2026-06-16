import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { DataView } from "./components/data-view";
export { DataViewSlots } from "./slots";
export type { DataViewContribution } from "./slots";
export { useResolveCell } from "./cell-slot";
export { useResolveOperatorSet } from "./filter-slot";
export { useFlatRows } from "./internal/use-flat-rows";
export { evaluateNode, applyFilter } from "./internal/evaluate-filter";
export { isFilterGroup } from "./internal/filter-shape";
export { useFilterController } from "./internal/use-filter-controller";
export type { FilterController } from "./internal/use-filter-controller";
export { pickPrimaryField } from "./internal/pick-primary-field";
export { defineItemActions } from "./internal/define-item-actions";
export type {
  ItemActions,
  ItemActionContribution,
} from "./internal/define-item-actions";
export type {
  FieldValue,
  FilterFieldValue,
  FieldDef,
  HierarchyConfig,
  SelectionConfig,
  SortState,
  ViewState,
  DataViewRenderProps,
  DataViewProps,
  TableCellProps,
  FilterValueInputProps,
  FilterOperator,
  FilterOperatorSet,
  FilterConjunction,
  FilterRule,
  FilterGroup,
  FilterNode,
  ItemActionProps,
  ItemActionsDescriptor,
} from "../core";

export default {
  description:
    "Notion-like multi-view data surface: one typed field schema rendered through swappable views with per-view sort/search/filter.",
  contributions: [],
} satisfies PluginDefinition;
