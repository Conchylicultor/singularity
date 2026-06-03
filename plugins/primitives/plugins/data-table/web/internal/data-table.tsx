import { cn } from "@/lib/utils";
import {
  MdArrowDownward,
  MdArrowUpward,
  MdUnfoldMore,
} from "react-icons/md";
import type { DataTableProps } from "./types";
import { useDataTable } from "./use-data-table";

export function DataTable<TRow>({
  data,
  columns,
  filter,
  rowKey,
  emptyLabel = "No results found",
}: DataTableProps<TRow>) {
  const { rows, sortState, toggleSort } = useDataTable(data, columns, filter);

  if (rows.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background p-control text-3xs font-medium uppercase tracking-wider text-muted-foreground">
        {columns.map((col) => {
          const sortable = !!col.value;
          const active = sortState?.columnId === col.id;
          return (
            <span
              key={col.id}
              className={cn(col.width, sortable && "cursor-pointer select-none")}
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
          className="flex items-center gap-2 border-b border-border/30 p-control text-xs hover:bg-accent/30"
        >
          {columns.map((col) => (
            <div key={col.id} className={cn(col.width, "truncate")}>
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
