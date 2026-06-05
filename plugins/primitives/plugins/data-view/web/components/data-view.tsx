import { type ReactNode, useMemo } from "react";
import type {
  Contribution,
  SealContributions,
} from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { cn } from "@/lib/utils";
import type { DataViewProps, DataViewRenderProps } from "../../core";
import { DataViewSlots, type DataViewContribution } from "../slots";
import { useViewState } from "../internal/use-view-state";
import { useDataViewRows } from "../internal/use-data-view-rows";
import { ViewSwitcher } from "./view-switcher";

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

  const processedRows = useDataViewRows(
    rows,
    fields,
    activeState,
    searchAccessor,
  );

  if (!activeView) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-2 pb-2">
          {title ? <div className="text-sm font-medium">{title}</div> : null}
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
          <div className="text-sm font-medium">{title}</div>
        ) : null}
        <SearchInput
          value={activeState.query}
          onChange={(e) => viewState.setQuery(activeViewId, e.target.value)}
          placeholder="Search…"
          wrapperClassName="ml-auto w-48"
        />
        {actions}
        <ViewSwitcher
          views={available}
          activeId={activeViewId}
          onSelect={viewState.setActiveView}
        />
      </div>
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
