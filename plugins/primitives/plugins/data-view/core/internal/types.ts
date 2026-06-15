import { type ComponentType, type ReactNode } from "react";
import type { Rank } from "@plugins/primitives/plugins/rank/core";

export type FieldValue = string | number | boolean | Date | null | undefined;

/**
 * The value a filter predicate receives: a scalar `FieldValue` for normal
 * fields, or a `readonly string[]` for multi-value `tags`-style fields (which
 * project via `FieldDef.values`). Scalar predicates accept this union and narrow
 * internally; only the `tags` predicate inspects the array branch.
 */
export type FilterFieldValue = FieldValue | readonly string[];

/**
 * The pure filter predicate applied in the data-view row pipeline. This alias
 * OWNS the parameter types — implementors derive them by contextual typing
 * (`const predicate: FilterPredicate = (filterValue, fieldValue) => …`) instead
 * of restating them. Widening `FilterFieldValue` therefore flows to every
 * implementor with zero edits, and annotating a narrower `fieldValue` becomes a
 * compile error (parameter contravariance).
 */
export type FilterPredicate = (
  filterValue: unknown,
  fieldValue: FilterFieldValue,
) => boolean;

/**
 * Describes the data source as a hierarchy. Supplied on `DataViewProps` (not the
 * per-view `options` channel) because it gates which views are available and
 * carries write capabilities. Present → the hierarchical views (tree) become
 * selectable; absent → the host drops them from the switcher.
 */
export interface HierarchyConfig<TRow> {
  getParentId: (row: TRow) => string | null;
  getRank: (row: TRow) => Rank;
  /** Server-persisted expand state. Omit → tree manages expand locally. */
  isExpanded?: (row: TRow) => boolean;
  onToggleExpanded?: (id: string, next: boolean) => void | Promise<void>;
  /** DnD reorder/reparent. Omit → read-only nav tree (no drag). */
  onMove?: (
    id: string,
    dest: { parentId: string | null; rank: Rank },
  ) => void | Promise<void>;
  /** Inline rename of the primary field. Omit → read-only label. */
  onRename?: (id: string, next: string) => void | Promise<void>;
  /** Create child/sibling. Omit → no add buttons. */
  onCreate?: (args: {
    parentId: string | null;
    rank?: Rank;
  }) => Promise<string | null | undefined>;
}

/**
 * Declares a data source as multi-selectable. Presence on `DataViewProps`
 * (mirroring `hierarchy`) enables checkbox multi-select in the views that
 * support it (currently the tree). Gate on `selection != null`, NOT on
 * `bulkActions` truthiness — `selection={{}}` still activates selection.
 */
export interface SelectionConfig {
  /** Bulk-action buttons in the SelectionBar (rendered inside the multi-select
   *  provider, so they may call useMultiSelect()). */
  bulkActions?: ReactNode;
}

export interface ItemActionProps<TRow> {
  row: TRow;
  /** True when this row has at least one child in the data source's hierarchy. */
  hasChildren: boolean;
}

/**
 * Minimal item-actions surface the views consume. `defineItemActions` (web)
 * returns a value satisfying this PLUS the callable contribution-registrar.
 */
export interface ItemActionsDescriptor<TRow> {
  /** Renders ALL contributed actions for one row, each error-boundary-isolated. */
  Row: ComponentType<ItemActionProps<TRow>>;
}

export interface FieldDef<TRow> {
  id: string;
  label: string;
  /** Field type id (open registry id). Default "text". */
  type?: string;
  /** Comparable projection used for sort/search/filter. */
  value?: (row: TRow) => FieldValue;
  /**
   * Multi-value projection for tags-style fields. Folded into search and passed
   * to the array-aware filter predicate. Mutually exclusive with `value`.
   */
  values?: (row: TRow) => string[];
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
  /** The field rendered as the tree row label. Fallback heuristic: first text field, else fields[0]. */
  primary?: boolean;
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
  /** Local expand state for hierarchical views lacking server-persisted expansion. */
  expanded?: Record<string, boolean>;
}

export interface DataViewRenderProps<TRow> {
  /** RAW rows. Each view applies the processing matching its own semantics
   * (gallery/table call `useFlatRows`; the tree feeds them straight to `TreeList`). */
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
  /** Currently-selected row id (tree highlight + auto-expand-to-selected). */
  selectedRowId?: string;
  /** viewOptions[activeViewId] — opaque to the host, typed by each view. */
  options: unknown;
  /** Custom search accessor; each view passes it into its own `useFlatRows`. */
  searchAccessor?: (row: TRow) => string;
  /** Present only when the data source is hierarchical (gates the tree view). */
  hierarchy?: HierarchyConfig<TRow>;
  /** Present → the view enables checkbox multi-select (currently the tree). */
  selection?: SelectionConfig;
  /** This view's local expand map — for hierarchical views whose data source has
   * no server-persisted expand state. Persisted in ViewState (localStorage). */
  expanded?: Record<string, boolean>;
  /** Persist local expand state for a row (writes THIS view's ViewState). */
  setExpanded?: (id: string, next: boolean) => void;
  emptyState?: ReactNode;
  /**
   * True while the backing data is still loading. Views render `loadingState`
   * (default: a skeleton) and NEVER `emptyState` — empty requires
   * confirmed-empty (`!loading && rows.length === 0`).
   */
  loading?: boolean;
  /** Override the loading render; default is each view's own skeleton shape. */
  loadingState?: ReactNode;
  /** Per-item action slot descriptor; views render `<itemActions.Row …/>` in
   *  their own trailing affordance (type-erased; views re-cast at the boundary). */
  itemActions?: ItemActionsDescriptor<TRow>;
  /** True when `rowId` has ≥1 child — derived once by the host from
   *  `hierarchy.getParentId` over `rows`. Flat views (table/gallery) call this
   *  for a correct `hasChildren`; the tree uses its own node count. */
  hasChildren?: (rowId: string) => boolean;
  /** True when the host is embedded (auto-height); views drop full-surface
   *  outer padding / forced heights. */
  embedded?: boolean;
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
  predicate: FilterPredicate;
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
  /** Currently-selected row id (tree highlight + auto-expand-to-selected). */
  selectedRowId?: string;
  emptyState?: ReactNode;
  /**
   * True while the backing data is still loading. The active view renders
   * `loadingState` (default: a skeleton) instead of `emptyState`, so a
   * loading list can never masquerade as a confirmed-empty one.
   */
  loading?: boolean;
  /** Override the loading render; default is each view's own skeleton shape. */
  loadingState?: ReactNode;
  /** Opaque per-view options channel, keyed by view id. */
  viewOptions?: Record<string, unknown>;
  /** Hierarchy accessors + mutations. Present → hierarchical views (tree) appear. */
  hierarchy?: HierarchyConfig<TRow>;
  /** Present → selectable views (tree) enable checkbox multi-select. */
  selection?: SelectionConfig;
  /** Per-item action slot descriptor minted by `defineItemActions`; views render
   *  each contributed action in their natural trailing affordance. */
  itemActions?: ItemActionsDescriptor<TRow>;
  /**
   * Placement / height. `"surface"` (default): fills a bounded-height flex
   * ancestor, owns its internal scroll, reserves the floating-action-bar gutter.
   * `"embedded"`: grows to natural content height, no internal scroll, no gutter —
   * the host pane scrolls. Use when stacked among siblings in a scrolling page.
   */
  mode?: "surface" | "embedded";
}
