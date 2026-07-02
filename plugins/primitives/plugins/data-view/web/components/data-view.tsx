import { cn, ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { type ReactNode, useCallback, useMemo } from "react";
import type {
  Contribution,
  SealContributions,
} from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import type {
  DataViewProps,
  DataViewRenderProps,
  FieldDef,
  FilterGroup,
  SortRule,
} from "../../core";
import {
  EditableViewSwitcher,
  useViewVariants,
} from "@plugins/primitives/plugins/data-view/plugins/view-core/web";
import { DataViewSlots, type DataViewContribution } from "../slots";
import {
  useDataViewModel,
  type ViewModel,
} from "../internal/use-data-view-model";
import { ScrollSentinel } from "@plugins/primitives/plugins/cursor-pagination/web";
import { useServerDataSource } from "../internal/use-server-data-source";
import { useFilterController } from "../internal/use-filter-controller";
import { useSortController } from "../internal/use-sort-controller";
import { useSortPresets } from "../internal/use-sort-presets";
import { useFilterPresets } from "../internal/use-filter-presets";
import { CollectFieldExtensions } from "../internal/field-extensions";
import { useScrollAncestorGuard } from "../internal/use-scroll-ancestor-guard";
import { FilterBuilderTrigger } from "./filter/filter-builder-trigger";
import { SortBuilderTrigger } from "./sort/sort-builder-trigger";
import { CreatorsControl } from "./creators-control";
import { DataViewToolbar } from "./toolbar/data-view-toolbar";
import { DataViewSettingsMenu } from "./settings/settings-menu";
import type { DataViewSettingsContextValue } from "./settings/settings-context";

/**
 * Host entry point. Every DataView is config-backed (config mode is universal):
 * its `storageKey` is a `defineDataView` id with a centrally-registered
 * `viewsDescriptor`, so the host always builds the config-backed `ViewModel`
 * (config-authored instances, full instance actions, durable per-instance
 * sort/filter written back to the config row) and renders the editable
 * view-switcher.
 */
export function DataView<TRow>(props: DataViewProps<TRow>): ReactNode {
  // Fold cross-plugin field contributions into `fields` BEFORE the model +
  // controllers, so the merged schema reaches `useSortController`,
  // `useFilterController`, and `renderProps.fields` uniformly (automatic once it
  // is the `fields` prop). Two nested folds:
  //
  //  1. the **global** `DataViewSlots.FieldExtension` slot — always folded (every
  //     DataView), threading `{ storageKey, rowKey }` so a contributor (e.g.
  //     custom-columns) can key its per-row fields over this surface; then
  //  2. the **per-consumer** `props.fieldExtensions` factory (Sonata's play-count
  //     / last-played fields) — a pass-through when absent.
  //
  // The host names no individual contributor: custom-columns folds in through the
  // generic global slot, inverting the old host→child bridge.
  //
  // The global fold runs in `unknown` row space (a global slot spans disjoint
  // consumer row types), so it is instantiated at `<unknown>`; `FieldDef<unknown>`
  // and `FieldDef<TRow>` are mutually related, so the two boundary casts are safe.
  return (
    <CollectFieldExtensions<unknown>
      descriptor={DataViewSlots.FieldExtension}
      base={props.fields as FieldDef<unknown>[]}
      extraProps={{ storageKey: props.storageKey, rowKey: props.rowKey }}
    >
      {(globalFields) => (
        <CollectFieldExtensions<unknown>
          descriptor={props.fieldExtensions}
          base={globalFields}
        >
          {(fields) => (
            <DataViewWithModel {...props} fields={fields as FieldDef<TRow>[]} />
          )}
        </CollectFieldExtensions>
      )}
    </CollectFieldExtensions>
  );
}

function DataViewWithModel<TRow>(props: DataViewProps<TRow>): ReactNode {
  const contributions = DataViewSlots.View.useContributions();
  const viewModel = useDataViewModel(
    props.storageKey,
    contributions,
    props.views,
    !!props.hierarchy,
    props.viewOptions,
    props.defaultView,
  );
  return <DataViewInner viewModel={viewModel} contributions={contributions} {...props} />;
}

function DataViewInner<TRow>({
  viewModel,
  contributions,
  ...props
}: DataViewProps<TRow> & {
  viewModel: ViewModel;
  contributions: SealContributions<DataViewContribution>[];
}): ReactNode {
  const {
    rows,
    rowKey,
    title,
    actions,
    searchAccessor,
    onRowActivate,
    selectedRowId,
    emptyState,
    loading,
    loadingState,
    hierarchy,
    manualOrder,
    aggregate,
    selection,
    itemActions,
    creators,
  } = props;

  // DataView is always natural-height and never owns a scroller — the pane owns
  // exactly one scroll (via `<PaneScroll>`). Dev-only structural guard fires if
  // the enclosing pane forgot to provide that scroll (kept in its own hook so the
  // effect's DOM walk stays out of this component's React Compiler analysis).
  const rootRef = useScrollAncestorGuard(props.storageKey);

  const viewVariants = useViewVariants(contributions);

  // The schema is already fully merged: `props.fields` here arrives AFTER the
  // top-level `DataView` folded both the global `DataViewSlots.FieldExtension`
  // slot (custom columns, keyed by `{ storageKey, rowKey }`) and the per-consumer
  // `fieldExtensions` factory into it. So the merged fields reach the model,
  // controllers, and render-props uniformly with no custom-columns knowledge here.
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

  const { instances, activeId } = viewModel;
  const activeInstance =
    instances.find((r) => r.instance.id === activeId) ?? instances[0] ?? null;

  const activeViewId = activeInstance?.instance.id ?? "";
  const activeState = viewModel.stateFor(activeViewId);

  // Optional server-delegated data source. Called unconditionally (the hook
  // no-ops and returns `null` when `props.dataSource` is absent — the in-memory
  // path). When present, filter/sort/search/paginate run server-side over the
  // live `activeState`, so the accumulated pages replace `rows` and the client
  // pipeline (`useFlatRows`) is neutralized into a pass-through below.
  const server = useServerDataSource(activeState, props.dataSource);

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
  const sortPresets = useSortPresets(props.storageKey);
  // Saved, shareable filter presets — the twin of sort presets, read from the
  // sibling `filterPresets` key in the same per-surface config doc (call
  // unconditionally next to the filter controller).
  const filterPresets = useFilterPresets(props.storageKey);
  // A view opts out of the Sort pill via `supportsSort: false`. Every current
  // view honors sort (the tree sorts each sibling group by field, defaulting to
  // manual/rank order), so this stays enabled; the flag remains for future
  // sort-less view types. Default (undefined) = honors sort.
  const activeSupportsSort = activeInstance?.viewType.supportsSort !== false;
  // Manual order is active when the consumer supplied `manualOrder` AND the
  // active view opts in (list/table; default false). When active the view orders
  // by rank and the Sort control is hidden (like the tree ignores sort).
  const activeSupportsManualOrder =
    !!activeInstance?.viewType.supportsManualOrder;
  const manualOrderActive = manualOrder != null && activeSupportsManualOrder;
  const hasSort =
    sortController.sortableFields.length > 0 &&
    activeSupportsSort &&
    !manualOrderActive;
  // Group-by support mirrors sort: the tree opts out (`supportsGroupBy: false`)
  // because it orders by hierarchy, not a flat field. The settings menu hides
  // the group-by control accordingly.
  const activeSupportsGroupBy =
    activeInstance?.viewType.supportsGroupBy !== false;

  // The per-view Properties control (which fields render in the body + their
  // order) now lives in the settings gear as a `view`-scope `DataViewSlots.Setting`
  // contribution (see `PropertiesControl`), reading/writing the same
  // `activeState.visibleFields` / `viewModel.setVisibleFields` via
  // `DataViewSettingsContext` — no host wiring needed here.

  // Config is the single source of truth: zero authored view-instances → render
  // an honest placeholder rather than an empty shell. The build-time
  // `data-view:configs-authored` check is the real forcing function; this keeps
  // the pane from crashing if a config is authored-but-empty.
  if (!activeInstance) {
    return (
      <Stack gap="none" ref={rootRef}>
        <Sticky
          edge="top"
          // eslint-disable-next-line layout/no-adhoc-layout -- horizontal toolbar row of variable-content controls; no named-slot primitive maps
          className={cn("bg-background flex items-center gap-sm px-sm pb-sm")}
        >
          {title ? (
            <Text as="div" variant="label">
              {title}
            </Text>
          ) : null}
          {actions ? <div className="ml-auto">{actions}</div> : null}
          <div className={actions ? undefined : "ml-auto"}>
            <CreatorsControl creators={creators} />
          </div>
        </Sticky>
        <div className="p-md">
          <Placeholder>
            No views configured — author{" "}
            <code>config/&lt;plugin&gt;/{props.storageKey}.jsonc</code>
          </Placeholder>
        </div>
      </Stack>
    );
  }

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

  // The host passes RAW rows; each view applies the processing matching its own
  // semantics (gallery/table call `useFlatRows`, the tree feeds `TreeList`).
  const renderProps: DataViewRenderProps<unknown> = {
    rows: effectiveRows,
    fields: fields as DataViewRenderProps<unknown>["fields"],
    rowKey: rowKey as DataViewRenderProps<unknown>["rowKey"],
    state: effectiveState,
    setSort: (fieldId) => viewModel.setSort(activeViewId, fieldId),
    setFilter: (filter) => viewModel.setFilter(activeViewId, filter),
    onRowActivate: onRowActivate as DataViewRenderProps<unknown>["onRowActivate"],
    selectedRowId,
    options: activeInstance.instance.options,
    searchAccessor:
      searchAccessor as DataViewRenderProps<unknown>["searchAccessor"],
    hierarchy: hierarchy as DataViewRenderProps<unknown>["hierarchy"],
    // Only hand `manualOrder` to a view that opts in (list/table); gallery/tree
    // see `undefined` so they never enter manual mode.
    manualOrder: activeSupportsManualOrder
      ? (manualOrder as DataViewRenderProps<unknown>["manualOrder"])
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
    storageKey: props.storageKey,
    fields: fields as DataViewRenderProps<unknown>["fields"],
    activeViewId,
    activeState,
    viewModel,
    activeSupportsGroupBy,
  };

  return (
    // `Stack gap="none"` = a plain `flex flex-col` block box (no `min-h-0 flex-1`)
    // that establishes this DataView's own sticky containing block and lets the
    // body grow to natural height — the pane (via `<PaneScroll>`) owns the scroll.
    <Stack gap="none" ref={rootRef}>
      {/* The toolbar adapts to its own width: the wide inline row below
          `COMPACT_BREAKPOINT`, the folded compact form (search-icon + `MdTune`
          options popover, single-view switcher hidden) above it. Each control
          element is built once and handed to the toolbar, which only relocates
          it — the sort/filter builder popovers are byte-for-byte identical in
          either layout. */}
      <DataViewToolbar
        title={title}
        query={activeState.query}
        onQueryChange={(next) => viewModel.setQuery(activeViewId, next)}
        switcher={
          <EditableViewSwitcher
            instances={instances}
            activeId={activeViewId}
            onSelect={viewModel.setActiveView}
            actions={viewModel.actions}
            viewVariants={viewVariants}
          />
        }
        switcherCount={instances.length}
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
            <SortBuilderTrigger controller={sortController} presets={sortPresets} />
          ) : null
        }
        actions={actions}
        /* Unified settings gear: renders every `DataViewSlots.Setting`
           contribution (per-view Group by, DataView-global custom-columns
           "Fields", …) uniformly. Self-hides when there is nothing to configure.
           Supersedes the old custom-columns-only gear. */
        fieldsControl={<DataViewSettingsMenu context={settingsContext} />}
        creatorsControl={<CreatorsControl creators={creators} />}
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
      <ControlSizeProvider size="xs">
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
      {/* Server-delegated infinite scroll: an IntersectionObserver sentinel that
          fetches the next page as it scrolls into view. Rendered only on the
          server path with more pages pending; the in-memory path renders nothing. */}
      {server?.hasMore ? (
        <ScrollSentinel sentinelRef={server.sentinelRef} show />
      ) : null}
    </Stack>
  );
}
