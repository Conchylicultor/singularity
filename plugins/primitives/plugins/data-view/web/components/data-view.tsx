import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { type ReactNode, useCallback, useMemo } from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import type {
  DataViewProps,
  DataViewRenderProps,
  FilterGroup,
} from "../../core";
import { DataViewSlots } from "../slots";
import { useViewState } from "../internal/use-view-state";
import { useResolvedInstances } from "../internal/resolve-instances";
import { useFilterController } from "../internal/use-filter-controller";
import { ViewSwitcher } from "./view-switcher";
import { FilterBuilderTrigger } from "./filter/filter-builder-trigger";
import { CreatorsControl } from "./creators-control";

export function DataView<TRow>(props: DataViewProps<TRow>): ReactNode {
  const {
    rows,
    fields,
    rowKey,
    views,
    defaultView,
    storageKey,
    title,
    actions,
    searchAccessor,
    onRowActivate,
    selectedRowId,
    emptyState,
    loading,
    loadingState,
    viewOptions,
    hierarchy,
    selection,
    itemActions,
    creators,
    mode = "surface",
  } = props;

  const embedded = mode === "embedded";

  const contributions = DataViewSlots.View.useContributions();

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

  // Resolve view instances: synthesizes one default instance per resolved
  // view-type (id === type, name === title), absorbing today's `available`
  // resolution — `views` prop is authoritative for inclusion+order (resolve
  // each type id, drop misses); otherwise all contributions by order/title;
  // hierarchical views (the tree) dropped when no `hierarchy`.
  const resolved = useResolvedInstances(
    contributions,
    views,
    !!hierarchy,
    viewOptions,
  );

  const instanceIds = useMemo(
    () => resolved.map((r) => r.instance.id),
    [resolved],
  );

  const viewState = useViewState(storageKey, instanceIds, defaultView);

  const activeInstance =
    resolved.find((r) => r.instance.id === viewState.activeViewId) ??
    resolved.find((r) => r.instance.id === defaultView) ??
    resolved[0] ??
    null;

  const activeViewId = activeInstance?.instance.id ?? "";
  const activeState = viewState.stateFor(activeViewId);

  // Filter controller — Phase 2's popover builder consumes the full surface
  // (filter, setFilter, filterableFields, resolveOperatorSet, ruleCount). Phase 1
  // wires it and renders only the trigger mount point below.
  const setActiveFilter = useCallback(
    (filter: FilterGroup | null) => viewState.setFilter(activeViewId, filter),
    [viewState, activeViewId],
  );
  const filterController = useFilterController(
    fields,
    activeState.filter,
    setActiveFilter,
  );
  const hasFilters = filterController.filterableFields.length > 0;

  if (!activeInstance) {
    return (
      <div className={cn("flex flex-col", !embedded && "min-h-0 flex-1")}>
        <div className="flex items-center gap-sm px-sm pb-sm">
          {title ? (
            <Text as="div" variant="label">
              {title}
            </Text>
          ) : null}
          {actions ? <div className="ml-auto">{actions}</div> : null}
          <div className={actions ? undefined : "ml-auto"}>
            <CreatorsControl creators={creators} />
          </div>
        </div>
      </div>
    );
  }

  // The host passes RAW rows; each view applies the processing matching its own
  // semantics (gallery/table call `useFlatRows`, the tree feeds `TreeList`).
  const renderProps: DataViewRenderProps<unknown> = {
    rows: rows as readonly unknown[],
    fields: fields as DataViewRenderProps<unknown>["fields"],
    rowKey: rowKey as DataViewRenderProps<unknown>["rowKey"],
    state: activeState,
    setSort: (fieldId) => viewState.setSort(activeViewId, fieldId),
    setFilter: (filter) => viewState.setFilter(activeViewId, filter),
    onRowActivate: onRowActivate as DataViewRenderProps<unknown>["onRowActivate"],
    selectedRowId,
    options: activeInstance.instance.options,
    searchAccessor:
      searchAccessor as DataViewRenderProps<unknown>["searchAccessor"],
    hierarchy: hierarchy as DataViewRenderProps<unknown>["hierarchy"],
    selection,
    expanded: activeState.expanded,
    setExpanded: (id, next) => viewState.setExpanded(activeViewId, id, next),
    emptyState,
    loading,
    loadingState,
    itemActions: itemActions as DataViewRenderProps<unknown>["itemActions"],
    hasChildren,
    embedded,
    creators,
  };

  return (
    <div className={cn("flex flex-col", !embedded && "min-h-0 flex-1")}>
      {/* pr-14 reserves the top-right gutter for the global floating action bar
          (fixed top-2 right-3, ~44px footprint) so right-aligned controls stay
          visible and clickable rather than sitting under it. */}
      <div
        // eslint-disable-next-line spacing/no-adhoc-spacing -- pr-14 reserves the fixed ~44px floating-action-bar gutter, a layout dimension the ramp can't express
        className={cn(
          "flex shrink-0 items-center gap-sm pb-sm pl-sm",
          !embedded && "pr-14",
        )}
      >
        {title ? (
          <Text as="div" variant="label">
            {title}
          </Text>
        ) : null}
        <SearchInput
          value={activeState.query}
          onChange={(e) => viewState.setQuery(activeViewId, e.target.value)}
          placeholder="Search…"
          wrapperClassName="ml-auto w-48"
        />
        {/* The filter builder: a pill trigger ("Filter" / "N rules") opening
            the Notion-style nested AND/OR popover builder. Rendered only when
            the schema has at least one filterable field. */}
        {hasFilters ? (
          <FilterBuilderTrigger controller={filterController} />
        ) : null}
        {actions}
        <CreatorsControl creators={creators} />
        <ViewSwitcher
          instances={resolved}
          activeId={activeViewId}
          onSelect={viewState.setActiveView}
        />
      </div>
      <div className={cn(!embedded && "min-h-0 flex-1 overflow-y-auto")}>
        {renderIsolated(
          DataViewSlots.View.id,
          activeInstance.viewType as unknown as Contribution,
          renderProps,
        )}
      </div>
    </div>
  );
}
