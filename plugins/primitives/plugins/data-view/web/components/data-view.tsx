import { cn, ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { type ReactNode, useCallback, useMemo } from "react";
import type {
  Contribution,
  SealContributions,
} from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import type {
  DataViewProps,
  DataViewRenderProps,
  FilterGroup,
  SortRule,
} from "../../core";
import {
  EditableViewSwitcher,
  useViewVariants,
} from "@plugins/primitives/plugins/data-view/plugins/view-core/web";
import {
  useCustomColumnDefs,
  DataViewSettingsButton,
} from "@plugins/primitives/plugins/data-view/plugins/custom-columns/web";
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
import { useCustomColumnFields } from "../internal/use-custom-column-fields";
import { dataViewDescriptors } from "../internal/descriptors";
import { useScrollAncestorGuard } from "../internal/use-scroll-ancestor-guard";
import { FilterBuilderTrigger } from "./filter/filter-builder-trigger";
import { SortBuilderTrigger } from "./sort/sort-builder-trigger";
import { CreatorsControl } from "./creators-control";

/**
 * Host entry point. Every DataView is config-backed (config mode is universal):
 * its `storageKey` is a `defineDataView` id with a centrally-registered
 * `viewsDescriptor`, so the host always builds the config-backed `ViewModel`
 * (config-authored instances, full instance actions, durable per-instance
 * sort/filter written back to the config row) and renders the editable
 * view-switcher.
 */
export function DataView<TRow>(props: DataViewProps<TRow>): ReactNode {
  // Fold any cross-plugin field contributions into `fields` BEFORE the model +
  // controllers, so the merged schema reaches `useSortController`,
  // `useFilterController`, and `renderProps.fields` uniformly (automatic once it
  // is the `fields` prop). No `fieldExtensions` → the fold is a pass-through.
  return (
    <CollectFieldExtensions descriptor={props.fieldExtensions} base={props.fields}>
      {(fields) => <DataViewWithModel {...props} fields={fields} />}
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

  // User-defined custom columns (ON by default; `customColumns={false}` opts a
  // surface out). The host resolves the per-surface config descriptor (it owns
  // `dataViewDescriptors`) and threads it DOWN into the child controller — the
  // custom-columns child never imports data-view (cycle). The defs feed the
  // bridge that turns them into ordinary `FieldDef`s appended to `props.fields`,
  // so they flow through every view + sort/filter/search. Hooks run
  // unconditionally; when opted out the bridge gets an empty defs list.
  const descriptor = dataViewDescriptors.get(props.storageKey);
  const customColumnsEnabled = props.customColumns !== false && descriptor != null;
  const { defs: customColumnDefs, ...customColumnActions } =
    useCustomColumnDefs(descriptor);
  const customFields = useCustomColumnFields<TRow>({
    storageKey: props.storageKey,
    rowKey,
    defs: customColumnsEnabled ? customColumnDefs : [],
  });
  // Appended custom columns flow into every view + sort/filter/search. Computed
  // inline (the React Compiler auto-memoizes) — a manual `useMemo` here can't be
  // preserved by the compiler and cascades into nearby memos.
  const fields = customColumnsEnabled
    ? [...props.fields, ...customFields]
    : props.fields;

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
  // The tree view orders by hierarchy rank and ignores ViewState.sort, so it
  // opts out via `supportsSort: false` — hide the Sort pill there (Filter still
  // shows; the tree honors filter). Default (undefined) = honors sort.
  const activeSupportsSort = activeInstance?.viewType.supportsSort !== false;
  const hasSort = sortController.sortableFields.length > 0 && activeSupportsSort;

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
    selection,
    expanded: activeState.expanded,
    setExpanded: (id, next) => viewModel.setExpanded(activeViewId, id, next),
    emptyState,
    itemActions: itemActions as DataViewRenderProps<unknown>["itemActions"],
    hasChildren,
    creators,
  };

  return (
    // `Stack gap="none"` = a plain `flex flex-col` block box (no `min-h-0 flex-1`)
    // that establishes this DataView's own sticky containing block and lets the
    // body grow to natural height — the pane (via `<PaneScroll>`) owns the scroll.
    <Stack gap="none" ref={rootRef}>
      <Sticky
        edge="top"
        // horizontal toolbar row of variable-content controls; no named-slot primitive maps. `bg-background` so rows don't show through the pinned bar
        // eslint-disable-next-line layout/no-adhoc-layout
        className={cn("bg-background flex items-center gap-sm pb-sm pl-sm")}
      >
        {title ? (
          <Text as="div" variant="label">
            {title}
          </Text>
        ) : null}
        {/* View switcher + its `+` add menu lead the toolbar (Notion-style):
            the view list anchors the left edge, everything else clusters at the
            right past the `ml-auto` spacer the search input carries. */}
        <EditableViewSwitcher
          instances={instances}
          activeId={activeViewId}
          onSelect={viewModel.setActiveView}
          actions={viewModel.actions}
          viewVariants={viewVariants}
        />
        {/* `ml-auto` is the toolbar's spacer: it shoves the search input and the
            whole trailing control cluster (filter/sort/config/new) to the right
            edge, away from the leading view switcher. */}
        <SearchInput
          value={activeState.query}
          onChange={(e) => viewModel.setQuery(activeViewId, e.target.value)}
          placeholder="Search…"
          wrapperClassName="ml-auto w-48"
        />
        {/* The filter + sort builders sit adjacent as a matched pair: each is a
            pill trigger ("Filter" / "N rules", "Sort" / "N sorts") opening its
            Notion-style popover. Each renders only when the schema has at least
            one eligible field. */}
        {hasFilters ? (
          <FilterBuilderTrigger
            controller={filterController}
            presets={filterPresets}
          />
        ) : null}
        {hasSort ? (
          <SortBuilderTrigger
            controller={sortController}
            presets={sortPresets}
          />
        ) : null}
        {actions}
        {customColumnsEnabled ? (
          <DataViewSettingsButton
            defs={customColumnDefs}
            actions={customColumnActions}
          />
        ) : null}
        <CreatorsControl creators={creators} />
      </Sticky>
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
