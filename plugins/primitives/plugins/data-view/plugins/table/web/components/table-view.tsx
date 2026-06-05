import type { ReactNode } from "react";
import {
  DataTable,
  type ColumnDef,
  type SortState as TableSortState,
} from "@plugins/primitives/plugins/data-table/web";
import type {
  DataViewRenderProps,
  FieldValue,
  SortState,
} from "@plugins/primitives/plugins/data-view/web";

/** FieldValue → data-table's `string | number | undefined` comparable projection. */
function coerce(value: FieldValue): string | number | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "boolean") return Number(value);
  if (value === null) return undefined;
  return value;
}

/** Map the data-view per-view sort onto data-table's column-keyed sort. */
function mapSort(sort: SortState | null): TableSortState | null {
  if (!sort) return null;
  return { columnId: sort.fieldId, direction: sort.direction };
}

export function TableView(props: DataViewRenderProps<unknown>): ReactNode {
  // DataTable's `emptyLabel` is string-only; render a custom empty node here so
  // the host-provided `emptyState` (ReactNode) is honored.
  if (props.rows.length === 0 && props.emptyState !== undefined) {
    return <>{props.emptyState}</>;
  }

  const columns: ColumnDef<unknown>[] = props.fields.map((f) => ({
    id: f.id,
    header: f.label,
    width: f.width,
    // data-table only sorts columns that carry `value`, and uses `value` as the
    // cell fallback. We always forward it when the field has one — sorting an
    // already-host-sorted column by the same key is idempotent. (For v1, a field
    // with `sortable === false` still exposes `value`; documented in CLAUDE.md.)
    value: f.value ? (row: unknown) => coerce(f.value!(row)) : undefined,
    cell: f.cell,
  }));

  return (
    <DataTable
      data={props.rows}
      columns={columns}
      rowKey={props.rowKey}
      sortState={mapSort(props.state.sort)}
      onToggleSort={(columnId) => props.setSort(columnId)}
      onRowClick={props.onRowActivate}
      filter={undefined}
      emptyLabel="No results found"
    />
  );
}
