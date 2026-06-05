import type { ReactNode } from "react";
import type { SortState } from "./use-data-table";

export interface ColumnDef<TRow> {
  id: string;
  header?: string;
  width?: string;
  value?: (row: TRow) => string | number | undefined;
  cell?: (row: TRow) => ReactNode;
}

export interface DataTableProps<TRow> {
  data: readonly TRow[];
  columns: ColumnDef<TRow>[];
  filter?: string;
  rowKey: (row: TRow, index: number) => string;
  emptyLabel?: string;
  /**
   * Host-controlled sort. When provided (alongside `onToggleSort`), the table
   * reflects this sort state instead of owning it internally.
   */
  sortState?: SortState | null;
  /** Host-controlled sort toggle; pairs with `sortState`. */
  onToggleSort?: (columnId: string) => void;
  /** When provided, rows become clickable and fire this on click/Enter/Space. */
  onRowClick?: (row: TRow) => void;
}
