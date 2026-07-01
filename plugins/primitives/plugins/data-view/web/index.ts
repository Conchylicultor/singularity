import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { dataViewConfigContributions } from "./internal/config-registrations";
import { DataViewSlots } from "./slots";
import { GroupByControl } from "./components/settings/group-by-control";

export { DataView } from "./components/data-view";
export { defineDataView } from "../core";
export type { DataViewId } from "../core";
export { DataViewSlots } from "./slots";
export type {
  DataViewContribution,
  DataViewSettingContribution,
} from "./slots";
export { useResolveCell } from "./cell-slot";
export { useResolveCellEditor } from "./cell-editor-slot";
export { useResolveOperatorSet } from "./filter-slot";
export { EditableCell } from "./components/editable-cell";
export { FieldCell } from "./components/field-cell";
export type { FieldCellProps } from "./components/field-cell";
export { FilterValueInput } from "./components/filter/filter-value-input";
export { ChipSelectFilterInput } from "./components/filter/chip-select-filter-input";
export { useFlatRows } from "./internal/use-flat-rows";
export { makeSortComparator } from "./internal/sort-rows";
export {
  useDataViewSections,
  partitionIntoSections,
  isGroupableField,
} from "./internal/use-data-view-sections";
export { useGroupByController } from "./internal/use-group-by-controller";
export type { GroupByController } from "./internal/use-group-by-controller";
export { useServerDataSource } from "./internal/use-server-data-source";
export type { ServerDataSourceResult } from "./internal/use-server-data-source";
export { evaluateNode, applyFilter } from "./internal/evaluate-filter";
export { isFilterGroup } from "./internal/filter-shape";
export { useFilterController } from "./internal/use-filter-controller";
export type { FilterController } from "./internal/use-filter-controller";
export { useSortController } from "./internal/use-sort-controller";
export type { SortController } from "./internal/use-sort-controller";
export { pickPrimaryField } from "./internal/pick-primary-field";
export { resolveBodyFields } from "./internal/resolve-body-fields";
export { defineItemActions } from "./internal/define-item-actions";
export type {
  ItemActions,
  ItemActionContribution,
} from "./internal/define-item-actions";
export { defineFieldExtensions } from "./internal/field-extensions";
export type {
  FieldExtensions,
  FieldExtensionContribution,
} from "./internal/field-extensions";
export type {
  FieldValue,
  FilterFieldValue,
  FieldDef,
  HierarchyConfig,
  SelectionConfig,
  CreateOption,
  ManualOrderConfig,
  SortRule,
  SortPreset,
  FilterPreset,
  ViewState,
  DataViewSection,
  DataViewRowEntry,
  DataViewAggregateConfig,
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
  ServerPage,
  ServerDataSourceSpec,
  ItemActionProps,
  ItemActionsDescriptor,
  FieldExtensionProps,
  FieldExtensionsDescriptor,
} from "../core";

export default {
  description:
    "Notion-like multi-view data surface: one typed field schema rendered through swappable views with per-view sort/search/filter.",
  // One config_v2 `views` descriptor per DataView id (scraped from
  // `defineDataView(...)` markers into data-views.generated.ts), all registered
  // under the `primitives.data-view` plugin. Mirrors reorder's central
  // per-slot registration — no per-consumer barrel boilerplate.
  contributions: [
    ...dataViewConfigContributions,
    // Group-by is the first DataView settings contribution (view scope). It
    // reads groupable fields + active groupBy from DataViewSettingsContext.
    DataViewSlots.Setting({
      id: "data-view.group-by",
      scope: "view",
      order: 0,
      component: GroupByControl,
    }),
  ],
} satisfies PluginDefinition;
