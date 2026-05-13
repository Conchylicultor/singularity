import type { ReactNode } from "react";

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
}
