import { type ComponentType, type ReactNode } from "react";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import type { DataViewId } from "./define-data-view";

export type FieldValue = string | number | boolean | Date | null | undefined;

/**
 * The value a filter predicate receives: a scalar `FieldValue` for normal
 * fields, or a `readonly string[]` for multi-value `tags`-style fields (which
 * project via `FieldDef.values`). Scalar predicates accept this union and narrow
 * internally; only the `tags` predicate inspects the array branch.
 */
export type FilterFieldValue = FieldValue | readonly string[];

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
  /** Create child/sibling. Omit → no add buttons. */
  onCreate?: (args: {
    parentId: string | null;
    rank?: Rank;
  }) => Promise<string | null | undefined>;
}

/**
 * A typed create affordance — a single "make a new row" action. Non-generic
 * (a creator produces a *new* row, so there is nothing to parametrize on
 * `TRow`), deliberately unlike `HierarchyConfig<TRow>`. The host renders a list
 * of these in the toolbar (1 → `Button`, N → `+` menu) and threads them to
 * views for opt-in surfaces (gallery trailing card + empty-state CTA).
 */
export interface CreateOption {
  /** Stable id (used as the React key in the menu / button list). */
  id: string;
  /** Action label, e.g. "New story", "Import MIDI". */
  label: string;
  /** Already-sized icon element (matches the `CoverContent` icon convention). */
  icon?: ReactNode;
  /** Longer description shown as a muted sub-line in the N-creator menu only. */
  description?: string;
  /** Run the create action. May be async — the host tracks in-flight busy state. */
  onSelect: () => void | Promise<unknown>;
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
  /**
   * Inline-edit write-back. Present → the table cell for this field becomes
   * editable (click-to-edit); absent → the cell stays read-only (the default for
   * every existing consumer). The host resolves a per-type editor via the
   * `data-view.cell-editor` slot and calls this on commit. Consumer owns
   * persistence — data-view stays presentational.
   */
  onEdit?: (row: TRow, next: FieldValue) => void | Promise<void>;
  /**
   * Multi-value inline-edit write-back. Pairs with `values` exactly as `onEdit`
   * pairs with `value`: present → the table cell becomes editable and the host
   * calls this with the full new array on commit. Mutually exclusive with `onEdit`
   * in practice (a field is scalar or multi). Consumer owns persistence.
   */
  onEditValues?: (row: TRow, next: string[]) => void | Promise<void>;
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

/**
 * One level of an ordered, multi-level sort. Priority = position in `SortRule[]`.
 * Keyed by `fieldId` (a field is sortable at most once), so no separate uid is
 * needed — `fieldId` is the React key AND the sortable-list drag id.
 */
export interface SortRule {
  fieldId: string;
  direction: "asc" | "desc";
}

/** A named, reusable multi-level sort. `rules` priority = list order. */
export interface SortPreset {
  /** Stable id (React key + delete/rename target; persisted in the config row). */
  id: string;
  label: string;
  rules: SortRule[];
}

export interface ViewState {
  /** Ordered sort rules (priority = list order). `[]` = unsorted (source order). */
  sort: SortRule[];
  /** Per-view quick search. */
  query: string;
  /** The view's filter tree (root is always a group when present), or null. */
  filter: FilterGroup | null;
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
  /** Writes THIS view's whole filter tree (null clears it). */
  setFilter: (filter: FilterGroup | null) => void;
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
  /**
   * Typed create affordances, threaded from `DataViewProps.creators`. Views may
   * opt into them (the gallery renders a trailing "+" card for a single creator
   * and an empty-state CTA). The host already renders the toolbar affordance —
   * views only render their own surface-specific create UI.
   */
  creators?: CreateOption[];
}

/**
 * Props passed to a `data-view.cell` contribution. `value` is the already-projected
 * `field.value(row)`; `raw` is the row itself (escape hatch only, non-canonical).
 */
export interface TableCellProps {
  value: FieldValue;
  /** Multi-value projection (`field.values(raw)`) for tags-style read cells. */
  values?: readonly string[];
  field: FieldDef<unknown>;
  raw?: unknown;
}

/**
 * Props passed to a `data-view.cell-editor` contribution — the inline editor for
 * one editable cell. Mirror of `TableCellProps` plus the commit/cancel channel.
 * `value` is the already-projected `field.value(row)`; `raw` is the row (escape
 * hatch). The editor is COMPACT (no label/header), fills the cell, autofocuses on
 * mount, and calls `onCommit(next)` on Enter/blur or `onCancel()` on Esc.
 */
export interface CellEditorProps {
  value: FieldValue;
  /** Current multi-value (`field.values(raw)`) for tags-style editors. */
  values?: readonly string[];
  field: FieldDef<unknown>;
  raw?: unknown;
  /** Commit a new scalar value. The host closes the editor and forwards to FieldDef.onEdit. */
  onCommit: (next: FieldValue) => void;
  /** Commit a new multi-value array. The host closes the editor and forwards to FieldDef.onEditValues. */
  onCommitValues: (next: string[]) => void;
  /** Abandon editing with no change. The host closes the editor. */
  onCancel: () => void;
}

/**
 * Props passed to an operator's `ValueInput` editor — the operand editor for a
 * single filter rule. `value` is the rule's stored operand (JSON-safe); the
 * editor writes new operands through `onChange`.
 */
export interface FilterValueInputProps {
  value: unknown;
  onChange: (value: unknown) => void;
  field: FieldDef<unknown>;
}

/**
 * One operator within a field type's operator set. The pure `predicate` is
 * applied in the row pipeline; `ValueInput` is the (optional) operand editor —
 * present iff `hasValue` is true. Living on the operator (not the type) lets
 * `date · is between` (two pickers) and `date · is` (one picker) differ, and
 * value-less operators (`is empty`) render no input.
 */
export interface FilterOperator {
  /** Unique within the set, e.g. "contains", "is-empty". */
  id: string;
  /** Dropdown label, e.g. "Contains", "Is empty". */
  label: string;
  /** false → no value editor (is-empty / is-not-empty). */
  hasValue: boolean;
  /** Present iff `hasValue`. The operand editor for a single rule. */
  ValueInput?: ComponentType<FilterValueInputProps>;
  /**
   * Pure predicate. `operand` is the rule's stored value (JSON-safe);
   * `fieldValue` is the row's projected value (FieldValue | readonly string[]).
   */
  predicate: (operand: unknown, fieldValue: FilterFieldValue) => boolean;
  /**
   * Whether a rule with this `operand` is *complete* — i.e. actually constrains
   * rows. Governs BOTH the chip's rule count and the evaluator's no-op gate, so
   * the two can never disagree. Default: a value-taking operator (`hasValue`)
   * needs a present operand; a value-less one is always complete. Override when
   * an absent operand still means something — e.g. `bool` reads it as
   * "Unchecked", a real constraint, so it stays complete even for `undefined`.
   */
  isComplete?: (operand: unknown) => boolean;
}

/**
 * A `data-view.filter` contribution — one per field type. The host resolves a
 * field's set via the `extends` chain (so inherited types reuse a parent's set).
 */
export interface FilterOperatorSet {
  /** Field type id, e.g. "text". */
  match: string;
  operators: FilterOperator[];
  /** Op id used when a rule is first created (default: operators[0]). */
  defaultOperator?: string;
}

export type FilterConjunction = "and" | "or";

export interface FilterRule {
  kind: "rule";
  /** Local uid (for React keys / edits). */
  id: string;
  fieldId: string;
  operatorId: string;
  /** Operand, JSON-serializable. */
  value?: unknown;
}

export interface FilterGroup {
  kind: "group";
  id: string;
  conjunction: FilterConjunction;
  children: FilterNode[];
}

export type FilterNode = FilterRule | FilterGroup;

export interface DataViewProps<TRow> {
  rows: readonly TRow[];
  fields: FieldDef<TRow>[];
  rowKey: (row: TRow, index: number) => string;
  /** Restrict + order by view id; omitted → all contributions by order/title. */
  views?: string[];
  defaultView?: string;
  storageKey: DataViewId;
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
   * Typed create affordances. The host renders them in the toolbar (1 → a
   * `Button`, N → a "+" dropdown menu, with host-owned in-flight busy state) and
   * threads them to views (gallery trailing card + empty-state CTA). Domain-pure
   * — a `CreateOption` carries only `id`/`label`/`icon`/`description`/`onSelect`.
   */
  creators?: CreateOption[];
}
