import { cn } from "@/lib/utils";
import {
  MdArrowDownward,
  MdArrowUpward,
  MdUnfoldMore,
} from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/text/web";
import type { ColumnDef, DataTableProps } from "./types";
import { useDataTable } from "./use-data-table";

export function DataTable<TRow>({
  data,
  columns,
  filter,
  rowKey,
  emptyLabel = "No results found",
  sortState: controlledSort,
  onToggleSort,
  onRowClick,
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
  const template = columns.map((col) => col.width ?? "auto").join(" ");

  return (
    <div className="grid gap-x-2" style={{ gridTemplateColumns: template }}>
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
      </div>
      {rows.map((row, i) => (
        <div
          key={rowKey(row, i)}
          className={cn(
            "col-span-full grid grid-cols-subgrid items-center border-b border-border/30 p-control text-caption hover:bg-accent/30",
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
        </div>
      ))}
    </div>
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
      className={cn(
        "mb-px ml-0.5 inline-block align-middle",
        active ? "text-foreground" : "text-muted-foreground/40",
      )}
    />
  );
}
