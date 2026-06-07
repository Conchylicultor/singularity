import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { DataView } from "./components/data-view";
export { DataViewSlots } from "./slots";
export type { DataViewContribution } from "./slots";
export { useResolveCell } from "./cell-slot";
export { useResolveFilter } from "./filter-slot";
export type {
  FieldValue,
  FieldDef,
  SortState,
  ViewState,
  DataViewRenderProps,
  DataViewProps,
  TableCellProps,
  FilterControlProps,
  FilterContribution,
} from "../core";

export default {
  name: "Data View",
  description:
    "Notion-like multi-view data surface: one typed field schema rendered through swappable views with per-view sort/search/filter.",
  contributions: [],
} satisfies PluginDefinition;
