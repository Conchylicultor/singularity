import type { PluginDefinition } from "@core";

export { DataTable } from "./internal/data-table";
export type { ColumnDef, DataTableProps } from "./internal/types";

export default {
  id: "data-table",
  name: "Data Table",
  description:
    "Sortable/filterable flex-layout data table primitive.",
  contributions: [],
} satisfies PluginDefinition;
