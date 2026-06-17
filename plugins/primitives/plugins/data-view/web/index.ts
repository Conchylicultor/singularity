import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { viewStateDescriptor } from "../shared/view-state-config";

export { DataView } from "./components/data-view";
export { viewsDescriptor } from "../shared/views-config";
export { DataViewSlots } from "./slots";
export type { DataViewContribution } from "./slots";
export { useResolveCell } from "./cell-slot";
export { useResolveCellEditor } from "./cell-editor-slot";
export { useResolveOperatorSet } from "./filter-slot";
export { EditableCell } from "./components/editable-cell";
export { FieldCell } from "./components/field-cell";
export type { FieldCellProps } from "./components/field-cell";
export { FilterValueInput } from "./components/filter/filter-value-input";
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
  CreateOption,
  SortState,
  ViewState,
  ViewInstance,
  DataViewRenderProps,
  DataViewProps,
  TableCellProps,
  CellEditorProps,
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
  contributions: [ConfigV2.WebRegister({ descriptor: viewStateDescriptor })],
} satisfies PluginDefinition;
