import { type ComponentType, type ReactNode } from "react";

export type FieldValue = string | number | boolean | Date | null | undefined;

/**
 * @deprecated Closed taxonomy kept only for back-compat with existing
 * `f.type === "media"` / `"text"` comparisons. The canonical field-type id is
 * now an open `string` resolved against the `fields.identity` registry.
 * Removed in task 2 of the unified-fields migration.
 */
export type FieldType =
  | "text"
  | "number"
  | "date"
  | "boolean"
  | "enum"
  | "media";

export interface FieldDef<TRow> {
  id: string;
  label: string;
  /** Field type id (open registry id). Default "text". */
  type?: string;
  /** Comparable projection used for sort/search/filter. */
  value?: (row: TRow) => FieldValue;
  /** Custom renderer; falls back to String(value ?? ""). */
  cell?: (row: TRow) => ReactNode;
  /** Default: true when `value` is present. */
  sortable?: boolean;
  /** Include in default search accessor; default true for text/enum. */
  filterable?: boolean;
  /**
   * CSS grid track size for the table column. Default `"auto"` (content-sized).
   * e.g. `"12rem"` (fixed), `"minmax(0,1fr)"` (absorbs leftover space + truncates).
   */
  width?: string;
  /** Text alignment within the table column (header + cells). Default `"start"`. */
  align?: "start" | "end" | "center";
  /** type:"enum" — enables Phase 3 chip/multiselect filtering. */
  options?: { value: string; label: string }[];
  /** type:"media" — gallery cover source. */
  cover?: boolean;
}

export interface SortState {
  fieldId: string;
  direction: "asc" | "desc";
}

export interface ViewState {
  sort: SortState | null;
  /** Per-view quick search. */
  query: string;
  /** Phase 3: per-field filter values (keyed by field id). Carried now. */
  filters: Record<string, unknown>;
}

export interface DataViewRenderProps<TRow> {
  /** AFTER this view's search + filter + sort. */
  rows: readonly TRow[];
  fields: FieldDef<TRow>[];
  rowKey: (row: TRow, index: number) => string;
  /** This view's own state. */
  state: ViewState;
  /** null→asc→desc→null cycle; writes THIS view's sort only. */
  setSort: (fieldId: string) => void;
  /** Phase 3: writes THIS view's filter value for a field. */
  setFilter: (fieldId: string, value: unknown) => void;
  /** Row/card click (default cards & table rows). */
  onRowActivate?: (row: TRow) => void;
  /** viewOptions[activeViewId] — opaque to the host, typed by each view. */
  options: unknown;
  emptyState?: ReactNode;
}

/**
 * Props passed to a `data-view.cell` contribution. `value` is the already-projected
 * `field.value(row)`; `raw` is the row itself (escape hatch only, non-canonical).
 */
export interface TableCellProps {
  value: FieldValue;
  field: FieldDef<unknown>;
  raw?: unknown;
}

/** Props passed to a `data-view.filter` Control (the future filter-bar input). */
export interface FilterControlProps {
  value: unknown;
  onChange: (value: unknown) => void;
  field: FieldDef<unknown>;
}

/**
 * A `data-view.filter` contribution: the Control (rendered by the future filter
 * bar) plus the pure predicate/isActive functions applied in the row pipeline.
 */
export interface FilterContribution {
  match: string;
  Control: ComponentType<FilterControlProps>;
  predicate: (filterValue: unknown, fieldValue: FieldValue) => boolean;
  isActive: (filterValue: unknown) => boolean;
}

export interface DataViewProps<TRow> {
  rows: readonly TRow[];
  fields: FieldDef<TRow>[];
  rowKey: (row: TRow, index: number) => string;
  /** Restrict + order by view id; omitted → all contributions by order/title. */
  views?: string[];
  defaultView?: string;
  storageKey: string;
  title?: ReactNode;
  actions?: ReactNode;
  searchAccessor?: (row: TRow) => string;
  onRowActivate?: (row: TRow) => void;
  emptyState?: ReactNode;
  /** Opaque per-view options channel, keyed by view id. */
  viewOptions?: Record<string, unknown>;
}
