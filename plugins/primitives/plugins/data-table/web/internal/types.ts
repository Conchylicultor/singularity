import type { ReactNode } from "react";
import type { SortState } from "./use-data-table";

export interface ColumnDef<TRow> {
  id: string;
  header?: string;
  /**
   * CSS grid track size for this column. Default `"auto"` (content-sized to the
   * widest cell, like a real table). e.g. `"12rem"` (fixed), `"minmax(0,1fr)"`
   * (absorbs leftover space + truncates), `"minmax(120px,200px)"`.
   * Header and body share one grid via subgrid, so alignment is automatic — no
   * `shrink-0` / `min-w-0` needed.
   */
  width?: string;
  /** Text alignment within the column (applies to header + cells). Default `"start"`. */
  align?: "start" | "end" | "center";
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
  /**
   * Row key of the active/selected row. The matching row gets a persistent
   * `bg-accent` highlight. Compared against `rowKey(row, index)`.
   */
  selectedRowId?: string;
  /** Trailing per-row actions, hover-revealed in their own column. */
  rowActions?: (row: TRow, index: number) => ReactNode;
}
