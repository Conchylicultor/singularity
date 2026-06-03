import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { DataTable } from "./internal/data-table";
export type { ColumnDef, DataTableProps } from "./internal/types";

export default {
  name: "Data Table",
  description:
    "Sortable/filterable flex-layout data table primitive.",
  contributions: [],
} satisfies PluginDefinition;
