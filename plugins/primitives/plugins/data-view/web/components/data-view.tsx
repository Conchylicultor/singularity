import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { type ReactNode, useCallback, useMemo } from "react";
import type {
  Contribution,
  SealContributions,
} from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
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
import { DataViewSlots, type DataViewContribution } from "../slots";
import {
  useDataViewModel,
  type ViewModel,
} from "../internal/use-data-view-model";
import { useFilterController } from "../internal/use-filter-controller";
import { useSortController } from "../internal/use-sort-controller";
import { useSortPresets } from "../internal/use-sort-presets";
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

  const viewVariants = useViewVariants(contributions);

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
      <Column
        fill={!embedded}
        header={
          // eslint-disable-next-line layout/no-adhoc-layout -- horizontal toolbar row; no named-slot primitive maps to a variable-content control set
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
        }
        body={
          <div className="p-md">
            <Placeholder>
              No views configured — author{" "}
              <code>config/&lt;plugin&gt;/{props.storageKey}.jsonc</code>
            </Placeholder>
          </div>
        }
      />
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
    <Column
      fill={!embedded}
      scrollBody={!embedded}
      header={
        // pr-14 reserves the top-right gutter for the global floating action bar
        // (fixed top-2 right-3, ~44px footprint) so right-aligned controls stay
        // visible and clickable rather than sitting under it.
        <div
          // horizontal toolbar row of variable-content controls; no named-slot primitive maps; pr-14 reserves the fixed ~44px floating-action-bar gutter, a layout dimension the ramp can't express
          // eslint-disable-next-line layout/no-adhoc-layout, spacing/no-adhoc-spacing
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
          {/* The sort + filter builders sit adjacent as a matched pair: each is
              a pill trigger ("Sort" / "N sorts", "Filter" / "N rules") opening
              its Notion-style popover. Each renders only when the schema has at
              least one eligible field. */}
          {hasSort ? (
            <SortBuilderTrigger
              controller={sortController}
              presets={sortPresets}
            />
          ) : null}
          {hasFilters ? (
            <FilterBuilderTrigger controller={filterController} />
          ) : null}
          {actions}
          <CreatorsControl creators={creators} />
          <EditableViewSwitcher
            instances={instances}
            activeId={activeViewId}
            onSelect={viewModel.setActiveView}
            actions={viewModel.actions}
            viewVariants={viewVariants}
          />
        </div>
      }
      body={renderIsolated(
        DataViewSlots.View.id,
        activeInstance.viewType as unknown as Contribution,
        renderProps,
      )}
    />
  );
}
