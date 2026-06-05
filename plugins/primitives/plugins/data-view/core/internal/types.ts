import { type ReactNode } from "react";

export type FieldValue = string | number | boolean | Date | null | undefined;

/**
 * Forward-compatible taxonomy; drives sort comparison, default search inclusion,
 * and (Phase 3) which filter control the future filter bar renders for the field.
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
  /** Default "text". */
  type?: FieldType;
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
