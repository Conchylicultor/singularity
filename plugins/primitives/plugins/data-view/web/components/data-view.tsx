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
import { cn } from "@/lib/utils";
import type {
  DataViewProps,
  DataViewRenderProps,
  FieldDef,
} from "../../core";
import { DataViewSlots, type DataViewContribution } from "../slots";
import { useViewState } from "../internal/use-view-state";
import { useDataViewRows } from "../internal/use-data-view-rows";
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
    emptyState,
    viewOptions,
  } = props;

  const contributions = DataViewSlots.View.useContributions();

  // Resolve available views: `views` prop is authoritative for inclusion+order
  // (resolve each id, drop misses); otherwise all contributions by order/title.
  const available = useMemo<SealContributions<DataViewContribution>[]>(() => {
    if (views) {
      return views
        .map((id) => contributions.find((c) => c.id === id))
        .filter(
          (c): c is SealContributions<DataViewContribution> => c !== undefined,
        );
    }
    return [...contributions].sort(
      (a, b) =>
        (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title),
    );
  }, [views, contributions]);

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
  const processedRows = useDataViewRows(
    rows,
    fields,
    activeState,
    resolveFilter,
    searchAccessor,
  );

  const hasFilters = useMemo(
    () => fields.some((f) => resolveFilter(f.type ?? "text") !== undefined),
    [fields, resolveFilter],
  );
  const [showFilters, setShowFilters] = useState(false);

  if (!activeView) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-2 pb-2">
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

  const renderProps: DataViewRenderProps<unknown> = {
    rows: processedRows as readonly unknown[],
    fields: fields as DataViewRenderProps<unknown>["fields"],
    rowKey: rowKey as DataViewRenderProps<unknown>["rowKey"],
    state: activeState,
    setSort: (fieldId) => viewState.setSort(activeViewId, fieldId),
    setFilter: (fieldId, value) =>
      viewState.setFilter(activeViewId, fieldId, value),
    onRowActivate: onRowActivate as DataViewRenderProps<unknown>["onRowActivate"],
    options: viewOptions?.[activeViewId],
    emptyState,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* pr-14 reserves the top-right gutter for the global floating action bar
          (fixed top-2 right-3, ~44px footprint) so right-aligned controls stay
          visible and clickable rather than sitting under it. */}
      <div className="flex shrink-0 items-center gap-2 pb-2 pl-2 pr-14">
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
        <div className="shrink-0 px-2 pb-2">
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
