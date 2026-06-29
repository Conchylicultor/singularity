import type { ReactNode } from "react";
import {
  DataTable,
  type ColumnDef,
  type SortState as TableSortState,
} from "@plugins/primitives/plugins/data-table/web";
import {
  FieldCell,
  useFlatRows,
  useResolveCell,
  useResolveCellEditor,
  useResolveOperatorSet,
  type DataViewRenderProps,
  type FieldValue,
  type ItemActionsDescriptor,
  type SortRule,
} from "@plugins/primitives/plugins/data-view/web";

/** FieldValue → data-table's `string | number | undefined` comparable projection. */
function coerce(value: FieldValue): string | number | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "boolean") return Number(value);
  if (value === null) return undefined;
  return value;
}

/**
 * Map the data-view PRIMARY sort rule onto data-table's single-column sort
 * indicator. Secondary rules don't paint a header arrow (the sort popover is the
 * full multi-sort surface); the data-table primitive stays single-sort.
 */
function mapPrimary(rules: SortRule[]): TableSortState | null {
  const p = rules[0];
  return p ? { columnId: p.fieldId, direction: p.direction } : null;
}

export function TableView(props: DataViewRenderProps<unknown>): ReactNode {
  // Resolved unconditionally (hooks rules) BEFORE the early empty-state return.
  const resolveCell = useResolveCell();
  const resolveEditor = useResolveCellEditor();
  // Rows arrive RAW; the table applies flat search/filter/sort itself.
  const resolveOperatorSet = useResolveOperatorSet();
  const rows = useFlatRows(
    props.rows,
    props.fields,
    props.state,
    resolveOperatorSet,
    props.searchAccessor,
  );

  // DataTable's `emptyLabel` is string-only; render a custom empty node here so
  // the host-provided `emptyState` (ReactNode) is honored.
  if (rows.length === 0 && props.emptyState !== undefined) {
    return <>{props.emptyState}</>;
  }

  // Documented cast boundary: itemActions arrives type-erased.
  const itemActions = props.itemActions as
    | ItemActionsDescriptor<unknown>
    | undefined;

  const columns: ColumnDef<unknown>[] = props.fields.map((f) => ({
    id: f.id,
    header: f.label,
    width: f.width,
    align: f.align,
    // data-table only sorts columns that carry `value`, and uses `value` as the
    // cell fallback. We always forward it when the field has one — sorting an
    // already-host-sorted column by the same key is idempotent. (For v1, a field
    // with `sortable === false` still exposes `value`; documented in CLAUDE.md.)
    value: f.value ? (row: unknown) => coerce(f.value!(row)) : undefined,
    // Shared FieldCell owns the uniform read precedence (consumer `cell` →
    // contributed `data-view.cell` slot → `String(value)`) and the click-to-edit
    // wrapper when the field declares `onEdit`/`onEditValues`.
    cell: (row: unknown) => (
      <FieldCell
        field={f}
        row={row}
        resolveCell={resolveCell}
        resolveEditor={resolveEditor}
      />
    ),
  }));

  return (
    <DataTable
      data={rows}
      columns={columns}
      rowKey={props.rowKey}
      sortState={mapPrimary(props.state.sort)}
      onToggleSort={(columnId) => props.setSort(columnId)}
      onRowClick={props.onRowActivate}
      selectedRowId={props.selectedRowId}
      filter={undefined}
      emptyLabel="No results found"
      rowActions={
        itemActions
          ? (row, i) => (
              <itemActions.Row
                row={row}
                hasChildren={props.hasChildren?.(props.rowKey(row, i)) ?? false}
              />
            )
          : undefined
      }
    />
  );
}
