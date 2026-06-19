import type { ReactNode } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  hoverRevealGroup,
  hoverRevealTarget,
} from "@plugins/primitives/plugins/hover-reveal/web";
import { useVirtualRows } from "@plugins/primitives/plugins/virtual-rows/web";
import {
  MdArrowDownward,
  MdArrowUpward,
  MdUnfoldMore,
} from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { ColumnDef, DataTableProps } from "./types";
import { useDataTable } from "./use-data-table";

/** Above this row count the table windows its rows via the shared virtualizer
 *  (keeps the subgrid + sticky header; only the visible slice is in the DOM).
 *  Smaller tables keep the plain map — no virtualizer overhead. */
const VIRTUALIZE_THRESHOLD = 100;

/** Estimated px per row; dynamic measurement via `virtualizer.measureElement`
 *  refines it after mount. */
const ROW_ESTIMATE = 36;

export function DataTable<TRow>({
  data,
  columns,
  filter,
  rowKey,
  emptyLabel = "No results found",
  sortState: controlledSort,
  onToggleSort,
  onRowClick,
  rowActions,
  selectedRowId,
}: DataTableProps<TRow>) {
  const { rows, sortState, toggleSort } = useDataTable(
    data,
    columns,
    filter,
    controlledSort,
    onToggleSort,
  );

  if (rows.length === 0) {
    return (
      <Text
        as="div"
        variant="caption"
        className="flex h-32 items-center justify-center text-muted-foreground"
      >
        {emptyLabel}
      </Text>
    );
  }

  // One grid owns the column tracks; the header and every row are full-span
  // subgrids that inherit those exact tracks (and the column gap), so columns
  // align structurally — independent of content. Dynamic template → inline style.
  // A trailing `auto` track holds the hover-revealed per-row actions column.
  const template = [
    ...columns.map((col) => col.width ?? "auto"),
    ...(rowActions ? ["auto"] : []),
  ].join(" ");

  // Shared row renderer so the plain branch and the windowed branch render
  // identical rows. The optional `measure` handle is supplied only by the
  // virtualized branch (tanstack's measureElement reads the data-index).
  const renderRow = (
    row: TRow,
    i: number,
    measure?: { ref: (el: Element | null) => void; index: number },
  ) => {
    const key = rowKey(row, i);
    return (
      <div
        key={key}
        ref={measure?.ref}
        data-index={measure?.index}
        className={cn(
          "group/dt-row col-span-full grid grid-cols-subgrid items-center border-b border-border/30 p-control text-caption hover:bg-accent/30",
          hoverRevealGroup,
          key === selectedRowId && "bg-accent",
          onRowClick && "cursor-pointer",
        )}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        role={onRowClick ? "button" : undefined}
        tabIndex={onRowClick ? 0 : undefined}
        onKeyDown={
          onRowClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onRowClick(row);
                }
              }
            : undefined
        }
      >
        {columns.map((col) => (
          <div key={col.id} className={cn("min-w-0 truncate", alignClass(col.align))}>
            {col.cell
              ? col.cell(row)
              : col.value
                ? String(col.value(row) ?? "")
                : null}
          </div>
        ))}
        {rowActions && (
          <div
            className={cn(
              "flex items-center justify-end gap-xs",
              hoverRevealTarget,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {rowActions(row, i)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid gap-x-sm" style={{ gridTemplateColumns: template }}>
      <div className="sticky top-0 z-raised col-span-full grid grid-cols-subgrid border-b bg-background p-control text-3xs font-medium uppercase tracking-wider text-muted-foreground">
        {columns.map((col) => {
          const sortable = !!col.value;
          const active = sortState?.columnId === col.id;
          return (
            <span
              key={col.id}
              className={cn(
                "min-w-0 truncate",
                alignClass(col.align),
                sortable && "cursor-pointer select-none",
              )}
              onClick={sortable ? () => toggleSort(col.id) : undefined}
            >
              {col.header}
              {sortable && (
                <SortIcon active={active} direction={active ? sortState!.direction : null} />
              )}
            </span>
          );
        })}
        {rowActions && <span aria-hidden />}
      </div>
      {rows.length > VIRTUALIZE_THRESHOLD ? (
        <VirtualTableBody
          rows={rows}
          rowKey={rowKey}
          selectedRowId={selectedRowId}
          renderRow={renderRow}
        />
      ) : (
        rows.map((row, i) => renderRow(row, i))
      )}
    </div>
  );
}

/**
 * Windowed table body: renders only the visible slice of rows in normal grid
 * flow between two `col-span-full` spacers that reserve the off-screen height —
 * so the outer subgrid column tracks and the sticky header stay intact (unlike
 * the absolute/translateY layout, which would drop rows out of grid flow).
 * A separate component so the virtualizer hook never runs for small tables.
 */
function VirtualTableBody<TRow>({
  rows,
  rowKey,
  selectedRowId,
  renderRow,
}: {
  rows: readonly TRow[];
  rowKey: (row: TRow, index: number) => string;
  selectedRowId: string | undefined;
  renderRow: (
    row: TRow,
    i: number,
    measure?: { ref: (el: Element | null) => void; index: number },
  ) => ReactNode;
}) {
  // Reveal the selected row when selection changes off-screen.
  const selectedIndex = selectedRowId
    ? rows.findIndex((row, i) => rowKey(row, i) === selectedRowId)
    : -1;

  const { measureRef, virtualizer, virtualItems, totalSize, scrollMargin } =
    useVirtualRows<TRow>({
      items: rows,
      estimateSize: ROW_ESTIMATE,
      getKey: rowKey,
      scrollToIndex: selectedIndex >= 0 ? selectedIndex : null,
    });

  // The marker sits at the start of the row region (right after the sticky
  // header); scrollMargin is measured from it.
  const marker = <div ref={measureRef} aria-hidden className="col-span-full h-0" />;

  if (virtualItems.length === 0) {
    return (
      <>
        {marker}
        <div aria-hidden className="col-span-full" style={{ height: totalSize }} />
      </>
    );
  }

  const paddingTop = virtualItems[0]!.start - scrollMargin;
  const paddingBottom =
    totalSize - (virtualItems[virtualItems.length - 1]!.end - scrollMargin);

  return (
    <>
      {marker}
      {paddingTop > 0 && (
        <div aria-hidden className="col-span-full" style={{ height: paddingTop }} />
      )}
      {virtualItems.map((vi) =>
        renderRow(rows[vi.index]!, vi.index, {
          ref: virtualizer.measureElement,
          index: vi.index,
        }),
      )}
      {paddingBottom > 0 && (
        <div aria-hidden className="col-span-full" style={{ height: paddingBottom }} />
      )}
    </>
  );
}

function alignClass(align: ColumnDef<unknown>["align"]): string | undefined {
  return align === "end" ? "text-right" : align === "center" ? "text-center" : undefined;
}

function SortIcon({
  active,
  direction,
}: {
  active: boolean;
  direction: "asc" | "desc" | null;
}) {
  const Icon =
    direction === "asc"
      ? MdArrowUpward
      : direction === "desc"
        ? MdArrowDownward
        : MdUnfoldMore;
  return (
    <Icon
      size={12}
      // eslint-disable-next-line spacing/no-adhoc-spacing -- one-off inline sort-icon offset next to the column header text
      className={cn(
        "mb-px ml-0.5 inline-block align-middle",
        active ? "text-foreground" : "text-muted-foreground/40",
      )}
    />
  );
}
