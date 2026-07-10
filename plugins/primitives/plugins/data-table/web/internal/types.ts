import type { ReactNode } from "react";
import type { ControlSize } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
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

/**
 * One group of rows for the interleaved group-header render mode. When
 * `DataTableProps.groups` is set, the table renders each group's caller-built
 * `header` as a full-span row inside the single subgrid (so columns stay aligned
 * across groups), then the group's rows when not `collapsed`. The header node is
 * fully owned by the caller (chevron, label, count, toggle) — the table stays
 * agnostic. Grouped mode is non-virtualized (targets bounded, sectioned lists).
 */
export interface DataTableGroup<TRow> {
  /** Stable key (React key for the header row). */
  key: string;
  /** Full-span header content (the caller owns the toggle + chevron + count). */
  header: ReactNode;
  /** Hide this group's rows (the header still renders, to allow re-expanding). */
  collapsed: boolean;
  rows: readonly TRow[];
}

export interface DataTableProps<TRow> {
  data: readonly TRow[];
  columns: ColumnDef<TRow>[];
  /**
   * Optional grouped render: interleave caller-built full-span section headers
   * with their rows inside the single subgrid. When set, `data` is ignored for
   * body rows (the rows come from each group) and virtualization is disabled.
   */
  groups?: DataTableGroup<TRow>[];
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
  /**
   * CSS length the table's own sticky rows pin at, measured from the top of the
   * scroll viewport. Defaults to `"0px"` (flush to the top). Set this when a
   * sticky element sits ABOVE the table in the SAME scroll container (e.g. a
   * DataView's sticky toolbar) so the sticky column-header row stacks directly
   * below it instead of hiding behind it; group headers then stack below the
   * column header (offset by its measured height). Accepts any CSS length,
   * including a `var(...)` / `calc(...)` expression.
   */
  stickyHeaderOffset?: string;
  /**
   * Per-row decoration HOOK, called once per rendered row INSIDE the row
   * component (so the consumer may call hooks — e.g. `useRankReorderItem` for
   * drag reorder). Returns a ref + props spread + classes + in-row overlay for
   * the row element. Composes with windowing: a decorated row is still measured
   * and windowed. Inert when absent. The name must start with `use` (it is
   * invoked as a hook). Stable per mount.
   */
  useRowDecoration?: (
    row: TRow,
    index: number,
  ) => DataTableRowDecoration | undefined;
  /**
   * Row keys that must stay mounted when scrolled out of the window — an
   * in-flight drag source, whose `useDraggable` would otherwise unregister
   * mid-gesture and cancel the drop. Pass the active drag id while a drag is in
   * flight, nothing otherwise. Ignored in grouped (non-windowed) mode.
   */
  keepMountedRowKeys?: readonly string[];
  /** Control density for the table's controls/badges; defaults to compact (`xs`). */
  controlSize?: ControlSize;
}

/**
 * Per-row decoration returned by `DataTableProps.useRowDecoration`. Applied to
 * the row element: a callback `ref` (drag source), arbitrary `props` spread
 * (drag attributes + listeners), extra `className`, and an in-row `overlay`
 * (absolutely-positioned drop indicators — the row becomes `relative`).
 */
export interface DataTableRowDecoration {
  ref?: (el: HTMLElement | null) => void;
  props?: Record<string, unknown>;
  className?: string;
  overlay?: ReactNode;
}
