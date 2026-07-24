import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { type ReactNode, useCallback, useMemo } from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import type {
  DataViewRenderProps,
  FieldDef,
  FieldExtensionsDescriptor,
  FilterGroup,
  ManualOrderConfig,
  SortRule,
} from "../../core";
import { DataViewSlots } from "../slots";
import { InfiniteScrollFooter } from "@plugins/primitives/plugins/cursor-pagination/web";
import { useServerDataSource } from "../internal/use-server-data-source";
import { useFilterController } from "../internal/use-filter-controller";
import { useSortController } from "../internal/use-sort-controller";
import { useSortPresets } from "../internal/use-sort-presets";
import { useFilterPresets } from "../internal/use-filter-presets";
import { CollectFieldExtensions } from "../internal/field-extensions";
import { CollectRowOrder } from "../internal/row-order";
import type { DataViewBodyProps } from "../internal/body-types";
import { FilterBuilderTrigger } from "./filter/filter-builder-trigger";
import { SortBuilderTrigger } from "./sort/sort-builder-trigger";
import { DataViewToolbar } from "./toolbar/data-view-toolbar";
import { DataViewSettingsMenu } from "./settings/settings-menu";
import type { DataViewSettingsContextValue } from "./settings/settings-context";

/**
 * The per-active-instance body: everything downstream of "which instance is
 * active". The shell mounts exactly one body inside its root; the body never
 * mounts when the surface has zero instances (the shell's placeholder branch
 * early-returns first).
 */
export function DataViewBody<TRow>(props: DataViewBodyProps<TRow>): ReactNode {
  // Fold cross-plugin field contributions into `fields` BEFORE the controllers,
  // so the merged schema reaches `useSortController`, `useFilterController`, and
  // `renderProps.fields` uniformly (automatic once it is the `fields` prop). ONE
  // fold over an ordered list of sources:
  //
  //  1. the **global** `DataViewSlots.FieldExtension` slot — always folded (every
  //     DataView), the cross-cutting contributor case (e.g. custom-columns); then
  //  2. the **per-consumer** `props.fieldExtensions` factory (Sonata's play-count
  //     / last-played fields) — appended only when present.
  //
  // Both are the same `FieldExtensionsDescriptor`; the fold threads
  // `{ storageKey, rowKey }` to every contributor (a per-consumer contributor
  // ignores the coordinates it does not need). The host names no individual
  // contributor: custom-columns folds in through the generic global slot,
  // inverting the old host→child bridge.
  //
  // The fold runs in `unknown` row space (the global slot spans disjoint consumer
  // row types), so `props.fields`/`rowKey` and the merged result cross a safe
  // `FieldDef<unknown>`↔`FieldDef<TRow>` boundary cast.
  const sources = props.fieldExtensions
    ? [
        DataViewSlots.FieldExtension,
        props.fieldExtensions as FieldExtensionsDescriptor<unknown>,
      ]
    : [DataViewSlots.FieldExtension];
  return (
    <CollectFieldExtensions
      sources={sources}
      base={props.fields as FieldDef<unknown>[]}
      storageKey={props.storageKey}
      rowKey={props.rowKey as (row: unknown, index: number) => string}
    >
      {(fields) => (
        <DataViewBodyInner {...props} fields={fields as FieldDef<TRow>[]} />
      )}
    </CollectFieldExtensions>
  );
}

/** All body hooks, unconditional — the only gate is the shell's placeholder
 *  early-return, which unmounts the whole body (a separate component). */
function DataViewBodyInner<TRow>(props: DataViewBodyProps<TRow>): ReactNode {
  const {
    rows,
    rowKey,
    searchAccessor,
    onRowActivate,
    selectedRowId,
    emptyState,
    loading,
    loadingState,
    hierarchy,
    viewOptions,
    manualOrder,
    aggregate,
    selection,
    itemActions,
    creators,
    storageKey,
    viewModel,
    activeInstance,
    chrome,
    sourceScope,
  } = props;

  // The schema is already fully merged: `props.fields` here arrives AFTER
  // `DataViewBody` folded both the global `DataViewSlots.FieldExtension` slot
  // (custom columns, keyed by `{ storageKey, rowKey }`) and the per-consumer
  // `fieldExtensions` factory into it. So the merged fields reach the
  // controllers and render-props uniformly with no custom-columns knowledge here.
  const fields = props.fields;

  // Derive the `hasChildren` predicate once from `hierarchy.getParentId` over
  // `rows` (absent hierarchy → always `false`). Flat views (table/gallery) use
  // it for a correct per-row `hasChildren`; the tree uses its own node count.
  const hasChildren = useMemo(() => {
    const parents = new Set<string>();
    if (hierarchy) {
      for (const row of rows) {
        const pid = hierarchy.getParentId(row);
        if (pid != null) parents.add(pid);
      }
    }
    return (rowId: string) => parents.has(rowId);
  }, [rows, hierarchy]);

  const activeViewId = activeInstance.instance.id;
  // Re-merge the bundle's code-supplied `viewOptions[type]` UNDER the instance
  // options. Idempotent on the single-source path (the model already merged
  // them into `instance.options`); on the merged path the model built its
  // entries from static metadata only, so this is where code-only options
  // (`renderRow`, `renderCard`, …) reach the view. Memoized so the `options`
  // identity stays stable across renders (as `instance.options` was).
  const mergedOptions = useMemo(
    () => ({
      ...((viewOptions?.[activeInstance.instance.type] as object | undefined) ??
        {}),
      ...((activeInstance.instance.options as object | undefined) ?? {}),
    }),
    [viewOptions, activeInstance],
  );
  // Computed here (not in the shell): `stateFor` mints a fresh object per call,
  // so the body reads it off the model itself and stays live on state writes.
  const activeState = viewModel.stateFor(activeViewId);

  // Optional server-delegated data source. Called unconditionally (the hook
  // no-ops and returns `null` when `props.dataSource` is absent — the in-memory
  // path). When present, filter/sort/search/paginate run server-side over the
  // live `activeState`, so the accumulated pages replace `rows` and the client
  // pipeline (`useFlatRows`) is neutralized into a pass-through below.
  const server = useServerDataSource(
    activeState,
    props.dataSource,
    storageKey,
    sourceScope,
  );

  // Filter controller — the popover builder consumes the full surface (filter,
  // setFilter, filterableFields, resolveOperatorSet, ruleCount).
  const setActiveFilter = useCallback(
    (filter: FilterGroup | null) => viewModel.setFilter(activeViewId, filter),
    [viewModel, activeViewId],
  );
  const filterController = useFilterController(
    fields,
    activeState.filter,
    setActiveFilter,
  );
  const hasFilters = filterController.filterableFields.length > 0;

  // Sort controller — the popover builder consumes the flat surface (rules,
  // sortableFields, ruleCount, add/remove/setDirection/setField/move/clear).
  const setActiveSortRules = useCallback(
    (rules: SortRule[]) => viewModel.setSortRules(activeViewId, rules),
    [viewModel, activeViewId],
  );
  const sortController = useSortController(
    fields,
    activeState.sort,
    setActiveSortRules,
  );
  // Saved, shareable sort presets — read from the sibling `sortPresets` key in
  // the same per-surface config doc (independent of the active instance, so call
  // unconditionally next to the sort controller).
  const sortPresets = useSortPresets(storageKey);
  // Saved, shareable filter presets — the twin of sort presets, read from the
  // sibling `filterPresets` key in the same per-surface config doc (call
  // unconditionally next to the filter controller).
  const filterPresets = useFilterPresets(storageKey);
  // A view opts out of the Sort pill via `supportsSort: false`. Every current
  // view honors sort (the tree sorts each sibling group by field, defaulting to
  // manual/rank order), so this stays enabled; the flag remains for future
  // sort-less view types. Default (undefined) = honors sort.
  const activeSupportsSort = activeInstance.viewType.supportsSort !== false;
  // Whether the active view can render a flat rank-ordered, drag-reorderable
  // body at all (list/table opt in; gallery/tree do not). It says nothing about
  // whether an order is *available* — see `manualOrderActive` below.
  const activeSupportsManualOrder =
    !!activeInstance.viewType.supportsManualOrder;
  // Manual order no longer suppresses the Sort pill: a sort simply overrides the
  // manual order (Notion's model), so the pill must stay reachable to clear it.
  const hasSort =
    sortController.sortableFields.length > 0 && activeSupportsSort;
  // Group-by support mirrors sort: every built-in view (including the tree,
  // which partitions its ROOTS into sections) supports it today; the opt-out
  // flag remains for future group-less view types. The settings menu hides the
  // group-by control accordingly.
  const activeSupportsGroupBy =
    activeInstance.viewType.supportsGroupBy !== false;

  // Whether a row-order contributor may own this view's order. Each clause is a
  // structural exclusion, not a preference:
  const rowOrderEnabled =
    activeSupportsManualOrder && // list / table only
    manualOrder == null && // a consumer's domain order wins
    props.dataSource == null && // server-paginated ⇒ the client cannot own the order
    aggregate == null && // an aggregate representative's rank cannot stand for its members
    !activeState.groupBy; // a cross-group drop would need a field write the primitive cannot do

  // The per-view Properties control (which fields render in the body + their
  // order) now lives in the settings gear as a `view`-scope `DataViewSlots.Setting`
  // contribution (see `PropertiesControl`), reading/writing the same
  // `activeState.visibleFields` / `viewModel.setVisibleFields` via
  // `DataViewSettingsContext` — no host wiring needed here.

  // Server-delegated substitution: when a `dataSource` drives this DataView, the
  // SQL already applied sort/filter/search, so feed the accumulated server rows
  // and neutralize the client pipeline (`useFlatRows` collapses to a pass-through
  // when sort/filter/query are empty). Absent → the in-memory path is untouched.
  const effectiveRows: readonly unknown[] = server
    ? server.rows
    : (rows as readonly unknown[]);
  // Neutralize ONLY the server-owned dimensions (sort/filter/query already ran in
  // SQL). `visibleFields` is display-only — it never touches the query — so the
  // `...activeState` spread deliberately PRESERVES it so the views still honor
  // Properties on the server-delegated path.
  const effectiveState = server
    ? { ...activeState, sort: [], filter: null, query: "" }
    : activeState;
  const effectiveLoading = server ? server.loading : loading;

  // Fold the global `RowOrder` slot around the whole render. The children-callback
  // is a plain function call (invoked in the fold's base case), NOT a component —
  // so it contains no hooks; every hook above stays in this component's body.
  //
  // The fold takes the RAW rows and derives the ordered set itself, but only when
  // `enabled` — deriving it here would cost EVERY DataView (tree, gallery,
  // server-paginated) an extra `useFlatRows` pass per render for a set it discards.
  return (
    <CollectRowOrder
      enabled={rowOrderEnabled}
      storageKey={storageKey}
      viewId={activeViewId}
      rowKey={rowKey as (row: unknown, index: number) => string}
      rows={effectiveRows}
      fields={fields as FieldDef<unknown>[]}
      state={activeState}
      resolveOperatorSet={filterController.resolveOperatorSet}
      searchAccessor={searchAccessor as ((row: unknown) => string) | undefined}
    >
      {(contributedRowOrder) => {
        // One rule everywhere — the render path never branches on where the order
        // came from. The consumer's domain order outranks any contributor.
        const cfg =
          (manualOrder as ManualOrderConfig<unknown> | undefined) ??
          contributedRowOrder ??
          null;
        // A field sort OVERRIDES the manual order and suspends drag; clearing it
        // restores the order. The sort test lives here and NOT in `rowOrderEnabled`
        // on purpose: toggling a sort off/on must not tear down the contributor's
        // live subscription, and `useDataViewSections`'s `manualRank ⇒ sort: []`
        // rule stays untouched — the host simply withholds the config while a sort
        // is set.
        const manualOrderActive =
          cfg != null && activeSupportsManualOrder && activeState.sort.length === 0;

        // The host passes RAW rows; each view applies the processing matching its own
        // semantics (gallery/table call `useFlatRows`, the tree feeds `TreeList`).
        const renderProps: DataViewRenderProps<unknown> = {
          rows: effectiveRows,
          fields: fields as DataViewRenderProps<unknown>["fields"],
          rowKey: rowKey as DataViewRenderProps<unknown>["rowKey"],
          state: effectiveState,
          setSort: (fieldId) => viewModel.setSort(activeViewId, fieldId),
          setFilter: (filter) => viewModel.setFilter(activeViewId, filter),
          onRowActivate:
            onRowActivate as DataViewRenderProps<unknown>["onRowActivate"],
          selectedRowId,
          options: mergedOptions,
          searchAccessor:
            searchAccessor as DataViewRenderProps<unknown>["searchAccessor"],
          hierarchy: hierarchy as DataViewRenderProps<unknown>["hierarchy"],
          // `manualOrderActive` already implies `cfg != null` (TS cannot see it
          // through the boolean), hence the assertion.
          manualOrder: manualOrderActive
            ? (cfg as ManualOrderConfig<unknown>)
            : undefined,
          // Aggregate is a pure pipeline transform (orthogonal to the supports* flags):
          // hand it to every flat view; only those rendering via `useDataViewSections`
          // (list/table/gallery) act on it — the tree ignores it.
          aggregate: aggregate as DataViewRenderProps<unknown>["aggregate"],
          selection,
          expanded: activeState.expanded,
          setExpanded: (id, next) => viewModel.setExpanded(activeViewId, id, next),
          collapsedSections: viewModel.collapsedSectionsFor(activeViewId),
          setSectionCollapsed: (key, collapsed) =>
            viewModel.setSectionCollapsed(activeViewId, key, collapsed),
          emptyState,
          itemActions: itemActions as DataViewRenderProps<unknown>["itemActions"],
          hasChildren,
          creators,
        };

        // Context for the unified settings menu — settings contributions (group-by,
        // custom-columns' "Fields" UI, …) read what they need from here, no
        // prop-threading. Custom-columns is now a real global-scope Setting contributor
        // (it imports the slot directly), so the host names it nowhere.
        const settingsContext: DataViewSettingsContextValue = {
          storageKey,
          fields: fields as DataViewRenderProps<unknown>["fields"],
          activeViewId,
          activeState,
          viewModel,
          activeSupportsGroupBy,
        };

        return (
          <>
            {/* The toolbar adapts to its own width: the wide inline row below
                `COMPACT_BREAKPOINT`, the folded compact form (search-icon + `MdTune`
                options popover, single-view switcher hidden) above it. Each control
                element is built once and handed to the toolbar, which only relocates
                it — the sort/filter builder popovers are byte-for-byte identical in
                either layout. */}
            <DataViewToolbar
              stickyRef={chrome.stickyRef}
              title={chrome.title}
              query={activeState.query}
              onQueryChange={(next) => viewModel.setQuery(activeViewId, next)}
              switcher={chrome.switcher}
              switcherCount={chrome.switcherCount}
              filterControl={
                hasFilters ? (
                  <FilterBuilderTrigger
                    controller={filterController}
                    presets={filterPresets}
                  />
                ) : null
              }
              sortControl={
                hasSort ? (
                  <SortBuilderTrigger
                    controller={sortController}
                    presets={sortPresets}
                  />
                ) : null
              }
              actions={chrome.actions}
              /* Unified settings gear: renders every `DataViewSlots.Setting`
                 contribution (per-view Group by, DataView-global custom-columns
                 "Fields", …) uniformly. Self-hides when there is nothing to configure.
                 Supersedes the old custom-columns-only gear. */
              fieldsControl={<DataViewSettingsMenu context={settingsContext} />}
              creators={creators}
              activeControlCount={
                (hasFilters ? filterController.ruleCount : 0) +
                (hasSort ? sortController.ruleCount : 0)
              }
            />
            {/* One density for every view type, so a row's controls and decorations
                (avatars, status dots, chips, buttons) look identical whether the same
                data is shown as a table, tree, list, or gallery. The table view's
                `data-table` primitive already defaults to `xs`; declaring it here once
                brings tree/list/gallery in line instead of each falling through to the
                ambient `md` default. */}
            {/* The host owns the loading→empty precedence: while loading it renders the
                view-type's declared skeleton and NEVER calls `renderIsolated`, so a view
                child only ever renders in the confirmed-not-loading state (it can no
                longer mishandle loading and let a skeleton-less empty state leak through). */}
            {/* Keyed by the active instance id so switching view instances remounts
                the view child (and its loading skeleton): virtualizer measurement
                caches, inline editors, and local tree expand state are per-instance
                and must not leak between two instances of the same view type. */}
            <ControlSizeProvider key={activeViewId} size="xs">
              {effectiveLoading
                ? (loadingState ?? (
                    <Loading
                      variant={activeInstance.viewType.loadingVariant ?? "rows"}
                      count={activeInstance.viewType.loadingCount}
                    />
                  ))
                : renderIsolated(
                    DataViewSlots.View.id,
                    activeInstance.viewType as unknown as Contribution,
                    renderProps,
                  )}
            </ControlSizeProvider>
            {/* Server-delegated infinite scroll: the error-gated footer (loading-more
                spinner, Retry on a failed page fetch, and the IntersectionObserver
                sentinel) that fetches the next page as it scrolls into view. Rendered
                only on the server path; the in-memory path renders nothing. */}
            {server ? <InfiniteScrollFooter handle={server.scroll} /> : null}
          </>
        );
      }}
    </CollectRowOrder>
  );
}
