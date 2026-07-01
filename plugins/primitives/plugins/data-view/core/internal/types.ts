import { type ComponentType, type ReactNode } from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
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

/**
 * Props a field-extension contribution receives. A contribution is a **component**
 * (not a plain `FieldDef[]`) so it can gather hook-loaded data (e.g. a live
 * resource keyed by row id) and close its field `value` projections over it,
 * then hand the resulting fields back via `render`. The host folds each
 * contributor's fields into the DataView's schema. The render-callback shape is
 * the generic lift of Sonata's old `Library.Sort` ordering-component slot.
 */
export interface FieldExtensionProps<TRow> {
  /** Hand the host this contributor's extra fields (called in render — the
   *  component is mounted, so it may load hook-backed data first). */
  render: (fields: FieldDef<TRow>[]) => ReactNode;
}

/**
 * Minimal field-extensions surface the host consumes. `defineFieldExtensions`
 * (web) returns a value satisfying this (the `RenderSlot`'s own `id` +
 * `useContributions`) PLUS the callable contribution-registrar — mirroring
 * `ItemActionsDescriptor`. The host (`CollectFieldExtensions`) reads
 * `useContributions()` and mounts each contribution isolated under `id`.
 */
export interface FieldExtensionsDescriptor<TRow> {
  /** Slot id — used as the `slotId` when the host mounts each contribution
   *  isolated (error-boundary). */
  id: string;
  /** All contributed field-extension components (sealed, like any slot). */
  useContributions: () => SealContributions<{
    id: string;
    component: ComponentType<FieldExtensionProps<TRow>>;
    order?: number;
  }>[];
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
  /**
   * Whether rows may be partitioned into sections by this field (the group-by
   * picker lists groupable fields only). Default: **true for `enum`/`bool`**,
   * false otherwise — mirroring how `sortable` defaults off `value`. A field
   * with no `value` projection is never groupable regardless of this flag.
   */
  groupable?: boolean;
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

/** A named, reusable filter — the twin of `SortPreset`. `group` is a full
 *  `FilterGroup` tree applied verbatim into the live filter on click. */
export interface FilterPreset {
  /** Stable id (React key + delete/rename target; persisted in the config row). */
  id: string;
  label: string;
  group: FilterGroup;
}

export interface ViewState {
  /** Ordered sort rules (priority = list order). `[]` = unsorted (source order). */
  sort: SortRule[];
  /** Per-view quick search. */
  query: string;
  /** The view's filter tree (root is always a group when present), or null. */
  filter: FilterGroup | null;
  /**
   * Per-view-instance visible-fields policy for BODY rendering (Notion
   * "Properties"). `null`/`undefined` = unconfigured → show ALL fields in schema
   * order (so later-added fields, incl. custom columns, auto-appear). An explicit
   * ordered array = the VISIBLE field ids in body order; any id absent from the
   * array is hidden. Display-only — it never touches sort/filter/search, which
   * always operate on the full field schema.
   */
  visibleFields?: string[] | null;
  /**
   * The field id rows are partitioned by (Notion's "Group by"), or absent =
   * ungrouped. Persisted in the per-instance config row exactly like
   * `sort`/`filter` (host-injected, merge-written). Legacy rows without the key
   * are ungrouped.
   */
  groupBy?: string;
  /** Local expand state for hierarchical views lacking server-persisted expansion. */
  expanded?: Record<string, boolean>;
}

/**
 * One partitioned section of a flat view's rows. The unifying envelope every
 * flat view renders against (`useDataViewSections`): when `state.groupBy` is
 * unset the pipeline returns exactly ONE section `{ key: null, … }` mapping rows
 * 1:1, so the un-grouped render is byte-for-byte identical to the old
 * `useFlatRows`-and-map. When grouped, one section per group key in display
 * order, each collapsible with a header label + member count.
 */
export interface DataViewSection<TRow> {
  /** Group key (the stringified `field.value(row)`); `null` = the implicit
   *  single section rendered headerless when no group-by is active. */
  key: string | null;
  /** Header label; absent for the implicit (`key === null`) section. */
  label?: ReactNode;
  /** Member-row count (pre-aggregation). */
  count: number;
  entries: DataViewRowEntry<TRow>[];
}

/**
 * One row entry within a `DataViewSection`. For group-by (Sub-task 1) it is a
 * 1:1 wrapper around a row; the optional `aggregateCount`/`members` fields are
 * the seam for aggregating sections (Sub-task 3), where one entry stands for a
 * collapsed group of rows sharing a key.
 */
export interface DataViewRowEntry<TRow> {
  /** Representative row (== the row when not aggregated). */
  row: TRow;
  /** `rowKey(row)` — the React key + selection/hasChildren identity. */
  key: string;
  /** >1 when this entry stands for a collapsed group (aggregating only). */
  aggregateCount?: number;
  /** Collapsed members (aggregating only). */
  members?: readonly TRow[];
}

/**
 * Aggregating-sections config — the **seam** for Sub-task 3 (collapse rows
 * sharing a key into one representative + count badge). Declared now so
 * `useDataViewSections` can carry it through its `opts` unchanged; the aggregate
 * step itself is NOT implemented in Sub-task 1.
 */
export interface DataViewAggregateConfig<TRow> {
  /** Group rows sharing a non-null key into one representative; `null` =
   *  standalone (never collapsed). */
  getKey: (row: TRow) => string | null;
  /** Pick the representative row for a collapsed group (default: first in
   *  current order). */
  pickRepresentative?: (members: readonly TRow[]) => TRow;
}

/**
 * Flat manual-order config — the flat twin of `HierarchyConfig`. Supplied on
 * `DataViewProps` (not the per-view `options` channel) because it carries write
 * capability and gates the manual-order mode. Present AND the active view opts in
 * (`supportsManualOrder`) → that view orders rows by `getRank` (skipping the
 * field sort, like the tree ignores sort), shows drag affordances, and the host
 * hides the Sort control. Reorder is **within a section**: a cross-section drag
 * reports the destination group via `onMove`'s `dest.groupKey`, which the
 * consumer maps to its own field mutation (the primitive carries no field/status
 * knowledge). Ungrouped → the single implicit `null` section.
 */
export interface ManualOrderConfig<TRow> {
  /** The sort `Rank` of a row — rows render in this order in manual mode. */
  getRank: (row: TRow) => Rank;
  /**
   * Persist a reorder. `id` is `rowKey(row)`; `dest.rank` is the new rank;
   * `dest.groupKey` is the destination section key (the drop target's group) —
   * equal to the dragged row's group for an in-section move, the new group for a
   * cross-section move, and `null`/absent when ungrouped.
   */
  onMove: (
    id: string,
    dest: { rank: Rank; groupKey?: string | null },
  ) => void | Promise<void>;
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
  /**
   * Present → the active view supports manual order AND the consumer supplied a
   * `manualOrder`. The view orders rows by `getRank`, shows drag affordances,
   * and reorders within a section via `rank-reorder`. The host already zeroes
   * this for views that opt out (`supportsManualOrder` falsy), so a view simply
   * checks presence.
   */
  manualOrder?: ManualOrderConfig<TRow>;
  /**
   * Present → rows sharing a non-null `getKey` collapse into one representative
   * entry + count badge (within each section). A pure pipeline transform —
   * orthogonal to the `supports*` flags — so the host threads it to every flat
   * view unconditionally; views read `entry.aggregateCount`/`entry.members` and
   * render the badge in their natural trailing spot.
   */
  aggregate?: DataViewAggregateConfig<TRow>;
  /** Present → the view enables checkbox multi-select (currently the tree). */
  selection?: SelectionConfig;
  /** This view's local expand map — for hierarchical views whose data source has
   * no server-persisted expand state. Persisted in ViewState (localStorage). */
  expanded?: Record<string, boolean>;
  /** Persist local expand state for a row (writes THIS view's ViewState). */
  setExpanded?: (id: string, next: boolean) => void;
  /** Device-local set of collapsed group-by section keys (absence = expanded).
   *  Flat views render group headers and hide a section's members when collapsed. */
  collapsedSections?: ReadonlySet<string>;
  /** Toggle a group-by section's device-local collapsed state. */
  setSectionCollapsed?: (key: string, collapsed: boolean) => void;
  /** Empty-state node, rendered only on confirmed-empty (`rows.length === 0`).
   *  Views NEVER see a loading state — the host renders the skeleton itself and
   *  skips `renderIsolated` while loading, so empty here always means empty. */
  emptyState?: ReactNode;
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
  /**
   * Optional section label used to group operators in the picker dropdown.
   * Operators sharing a `group` render under one uppercase-muted header, in
   * first-seen group order; operators with no `group` fall into a single
   * unlabeled default section (the pre-grouping flat-list behavior).
   */
  group?: string;
  /**
   * When true the operator is NOT offered in the picker dropdown, but stays
   * resolvable by id — so an already-saved filter using it still evaluates and
   * still shows its label in the trigger. Deprecation-without-breakage.
   */
  hidden?: boolean;
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

/**
 * One page of a server-delegated query. `nextCursor` is the server-computed
 * keyset cursor to seek the next page from (null when exhausted); `hasMore`
 * gates whether `fetchPage` should be called again.
 */
export interface ServerPage<TRow> {
  items: TRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Server-delegated data source. Present on `DataViewProps` → filter/sort/search/
 * paginate run server-side; the host feeds accumulated pages through and
 * neutralizes the client pipeline (`useFlatRows` becomes identity). Absent → the
 * DataView stays 100% in-memory over `rows` (the default for every consumer).
 *
 * `fetchPage` is a factory (not pre-resolved rows): `DataViewInner` invokes it
 * with the live `activeState` (sort/filter/query) it already owns plus the
 * keyset `cursor` + `limit`, so `ViewState` stays the single source of truth and
 * the consumer never touches it.
 */
export interface ServerDataSourceSpec<TRow> {
  fetchPage: (args: {
    sort: SortRule[];
    filter: FilterGroup | null;
    query: string;
    cursor: string | null;
    limit: number;
  }) => Promise<ServerPage<TRow>>;
  /** Changes when server truth changes — drives an in-place refetch of loaded pages. */
  changeTick: unknown;
  pageSize?: number;
}

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
  /**
   * Flat manual-order accessors + mutation. Present → views that opt in
   * (`supportsManualOrder`: list/table) order by `getRank` and enable rank-based
   * drag reordering; the host hides the Sort control on the active view while
   * manual order is active. Composes with group-by: a cross-section drag reports
   * the destination section via `onMove`'s `dest.groupKey`.
   */
  manualOrder?: ManualOrderConfig<TRow>;
  /**
   * Aggregating sections — collapse rows sharing a non-null `getKey` into one
   * representative row + count badge (within each group-by section). Present →
   * flat views (list/table/gallery) render the representative with a `×N` badge;
   * absent → every row renders 1:1 (the default). "Acting on the representative
   * acts on the group" is the consumer's mutation concern — the primitive only
   * owns the visual collapse + representative selection + count badge. Composes
   * with `manualOrder` (collapse the rank-ordered entries) and group-by.
   */
  aggregate?: DataViewAggregateConfig<TRow>;
  /** Present → selectable views (tree) enable checkbox multi-select. */
  selection?: SelectionConfig;
  /** Per-item action slot descriptor minted by `defineItemActions`; views render
   *  each contributed action in their natural trailing affordance. */
  itemActions?: ItemActionsDescriptor<TRow>;
  /**
   * Optional cross-plugin field contribution surface minted by
   * `defineFieldExtensions`. Present → the host folds every contributor's extra
   * `FieldDef[]` into `fields` BEFORE the sort/filter controllers and the view
   * render-props, so contributed fields appear in the Sort pill, Filter pill, and
   * table columns for free. Each contributor is a component (it may load
   * hook-backed data), so the merge happens through a render-callback fold.
   */
  fieldExtensions?: FieldExtensionsDescriptor<TRow>;
  /**
   * Typed create affordances. The host renders them in the toolbar (1 → a
   * `Button`, N → a "+" dropdown menu, with host-owned in-flight busy state) and
   * threads them to views (gallery trailing card + empty-state CTA). Domain-pure
   * — a `CreateOption` carries only `id`/`label`/`icon`/`description`/`onSelect`.
   */
  creators?: CreateOption[];
  /**
   * Optional server-delegated data source. Present → filter/sort/search/paginate
   * run server-side (compiled to SQL) over the live `activeState` the host owns;
   * the accumulated pages replace `rows` and the client pipeline collapses to a
   * pass-through. Absent → the in-memory path over `rows` (unchanged default).
   */
  dataSource?: ServerDataSourceSpec<TRow>;
  /**
   * User-defined custom columns (text, v1) are ON by default for every DataView.
   * Set `false` on surfaces where ad-hoc metadata doesn't belong (debug/metric/
   * config tables, or index-derived rowKeys). The mechanism is generic — values
   * are keyed by `storageKey` + `rowKey`, so `rowKey` must be index-independent
   * (the bridge calls `rowKey(row, 0)`). Server-delegated (`dataSource`) views
   * still render + edit custom columns but don't sort/filter on them server-side.
   */
  customColumns?: boolean;
}
