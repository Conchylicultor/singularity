import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { type ReactNode, useCallback, useMemo } from "react";
import type {
  Contribution,
  SealContributions,
} from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useConfigRegistrations } from "@plugins/config_v2/web";
import type {
  DataViewProps,
  DataViewRenderProps,
  FilterGroup,
} from "../../core";
import { DataViewSlots, type DataViewContribution } from "../slots";
import {
  useDefaultViewModel,
  useConfigViewModel,
  type ViewModel,
} from "../internal/use-view-model";
import { useViewVariants } from "../internal/use-view-variants";
import { useFilterController } from "../internal/use-filter-controller";
import { viewsDescriptor } from "../../shared/views-config";
import { ViewSwitcher } from "./view-switcher";
import { EditableViewSwitcher } from "./editable-view-switcher";
import { FilterBuilderTrigger } from "./filter/filter-builder-trigger";
import { CreatorsControl } from "./creators-control";

/**
 * Host entry point. Chooses a **mode once per mount** by whether the consumer
 * registered `viewsDescriptor(storageKey)` (config mode) or not (default mode),
 * then mounts a wrapper that builds the unified `ViewModel` and renders
 * `DataViewInner`. The mode-branch is a stable component split — so the
 * conditional `useConfig` inside the config wrapper is legal (it only ever runs
 * in a mount whose branch never changes).
 */
export function DataView<TRow>(props: DataViewProps<TRow>): ReactNode {
  const { storageKey } = props;
  const descriptor = viewsDescriptor(storageKey);
  const registrations = useConfigRegistrations();
  const isRegistered = useMemo(
    () => registrations.some((r) => r.descriptor === descriptor),
    [registrations, descriptor],
  );

  return isRegistered ? (
    <ConfigDataView {...props} />
  ) : (
    <DefaultDataView {...props} />
  );
}

function DefaultDataView<TRow>(props: DataViewProps<TRow>): ReactNode {
  const contributions = DataViewSlots.View.useContributions();
  const viewModel = useDefaultViewModel(
    props.storageKey,
    contributions,
    props.views,
    !!props.hierarchy,
    props.viewOptions,
    props.defaultView,
  );
  return <DataViewInner viewModel={viewModel} contributions={contributions} {...props} />;
}

function ConfigDataView<TRow>(props: DataViewProps<TRow>): ReactNode {
  const contributions = DataViewSlots.View.useContributions();
  const viewModel = useConfigViewModel(
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
    fields,
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
    mode = "surface",
  } = props;

  const embedded = mode === "embedded";

  const viewVariants = useViewVariants();

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
          onChange={(e) => viewModel.setQuery(activeViewId, e.target.value)}
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
        {viewModel.actions ? (
          <EditableViewSwitcher
            instances={instances}
            activeId={activeViewId}
            onSelect={viewModel.setActiveView}
            actions={viewModel.actions}
            viewVariants={viewVariants}
          />
        ) : (
          <ViewSwitcher
            instances={instances}
            activeId={activeViewId}
            onSelect={viewModel.setActiveView}
          />
        )}
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
