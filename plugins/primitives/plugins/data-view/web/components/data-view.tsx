import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { type ReactNode, useMemo, useState } from "react";
import { MdFilterList } from "react-icons/md";
import type {
  Contribution,
  SealContributions,
} from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import type {
  DataViewProps,
  DataViewRenderProps,
  FieldDef,
} from "../../core";
import { DataViewSlots, type DataViewContribution } from "../slots";
import { useViewState } from "../internal/use-view-state";
import { useResolveFilter } from "../filter-slot";
import { ViewSwitcher } from "./view-switcher";
import { FilterBar } from "./filter-bar";

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
  } = props;

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

  // Resolve available views: `views` prop is authoritative for inclusion+order
  // (resolve each id, drop misses); otherwise all contributions by order/title.
  // Hierarchical views (the tree) require `hierarchy` — drop them when absent so
  // a `views={["tree"]}` with no hierarchy can never render a broken view.
  const available = useMemo<SealContributions<DataViewContribution>[]>(() => {
    const usable = hierarchy
      ? contributions
      : contributions.filter((c) => !c.hierarchical);
    if (views) {
      return views
        .map((id) => usable.find((c) => c.id === id))
        .filter(
          (c): c is SealContributions<DataViewContribution> => c !== undefined,
        );
    }
    return [...usable].sort(
      (a, b) =>
        (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title),
    );
  }, [views, contributions, hierarchy]);

  const viewIds = useMemo(() => available.map((v) => v.id), [available]);

  const viewState = useViewState(storageKey, viewIds, defaultView);

  const activeView =
    available.find((v) => v.id === viewState.activeViewId) ??
    available.find((v) => v.id === defaultView) ??
    available[0] ??
    null;

  const activeViewId = activeView?.id ?? "";
  const activeState = viewState.stateFor(activeViewId);

  const resolveFilter = useResolveFilter();

  const hasFilters = useMemo(
    () => fields.some((f) => resolveFilter(f.type ?? "text") !== undefined),
    [fields, resolveFilter],
  );
  const [showFilters, setShowFilters] = useState(false);

  if (!activeView) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-sm px-sm pb-sm">
          {title ? (
            <Text as="div" variant="label">
              {title}
            </Text>
          ) : null}
          {actions ? <div className="ml-auto">{actions}</div> : null}
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
    setFilter: (fieldId, value) =>
      viewState.setFilter(activeViewId, fieldId, value),
    onRowActivate: onRowActivate as DataViewRenderProps<unknown>["onRowActivate"],
    selectedRowId,
    options: viewOptions?.[activeViewId],
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
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* pr-14 reserves the top-right gutter for the global floating action bar
          (fixed top-2 right-3, ~44px footprint) so right-aligned controls stay
          visible and clickable rather than sitting under it. */}
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- pr-14 reserves the fixed ~44px floating-action-bar gutter, a layout dimension the ramp can't express */}
      <div className="flex shrink-0 items-center gap-sm pb-sm pl-sm pr-14">
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
        {hasFilters ? (
          <IconButton
            icon={MdFilterList}
            label="Filter"
            variant={showFilters ? "secondary" : "ghost"}
            aria-pressed={showFilters}
            onClick={() => setShowFilters((v) => !v)}
          />
        ) : null}
        {actions}
        <ViewSwitcher
          views={available}
          activeId={activeViewId}
          onSelect={viewState.setActiveView}
        />
      </div>
      {showFilters && hasFilters ? (
        <div className="shrink-0 px-sm pb-sm">
          <FilterBar
            fields={fields as FieldDef<unknown>[]}
            filters={activeState.filters}
            setFilter={(id, v) => viewState.setFilter(activeViewId, id, v)}
            resolveFilter={resolveFilter}
          />
        </div>
      ) : null}
      <div className={cn("min-h-0 flex-1 overflow-y-auto")}>
        {renderIsolated(
          DataViewSlots.View.id,
          activeView as unknown as Contribution,
          renderProps,
        )}
      </div>
    </div>
  );
}
