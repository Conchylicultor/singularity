import { useCallback, useMemo } from "react";
import type { ComponentType } from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import type { VariantValue } from "@plugins/fields/plugins/variant/core";
import { useViewModel } from "@plugins/primitives/plugins/data-view/plugins/view-core/web";
import type { ResolvedViewInstance } from "@plugins/primitives/plugins/data-view/plugins/view-core/web";
import type { FilterGroup, SortState, ViewState } from "../../core";
import type { DataViewContribution } from "../slots";
import { dataViewDescriptors } from "./descriptors";
import { useViewEphemeral } from "./use-view-ephemeral";

/** A view-type the add-menu offers (capability-gated). */
export interface AddableViewType {
  type: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
}

/** Instance actions for the editable view-switcher (every DataView has these). */
export interface ViewActions {
  /** View-types the `+` menu offers: registered contributions ∩ `views`
   *  whitelist (if any) ∩ hierarchical gate. */
  available: AddableViewType[];
  addView: (type: string) => void;
  renameView: (id: string, name: string) => void;
  duplicateView: (id: string) => void;
  deleteView: (id: string) => void;
  reorderView: (id: string, toIndex: number) => void;
  updateView: (id: string, view: VariantValue, opts?: { merge?: boolean }) => void;
}

/** The unified host contract — the exact shape `data-view.tsx` consumes. */
export interface ViewModel {
  instances: ResolvedViewInstance<DataViewContribution>[];
  activeId: string;
  setActiveView: (id: string) => void;
  stateFor: (id: string) => ViewState;
  setSort: (id: string, fieldId: string) => void;
  setFilter: (id: string, filter: FilterGroup | null) => void;
  setQuery: (id: string, q: string) => void;
  setExpanded: (id: string, k: string, v: boolean) => void;
  /** Instance actions for the editable switcher (always present). */
  actions: ViewActions;
}

/** Read the host-managed sort/filter keys off a row's raw variant value. */
function readSort(view: VariantValue | undefined): SortState | null {
  return (view?.sort as SortState | null | undefined) ?? null;
}
function readFilter(view: VariantValue | undefined): FilterGroup | null {
  return (view?.filter as FilterGroup | null | undefined) ?? null;
}

/**
 * data-view's host model. Wraps view-core's generic `useViewModel` and layers the
 * view-content semantics on top:
 *   - `sortFor`/`filterFor` read the host-managed `sort`/`filter` keys off the raw
 *     config row (`viewFor`),
 *   - `setSort` runs the null→asc→desc→null cycle and `setFilter` writes the whole
 *     tree, both via `updateView(id, { ...view, sort/filter }, { merge: true })`
 *     so the engine preserves every other key,
 *   - `query`/`expanded` come from the device-local ephemeral store,
 *   - the result is repacked into the exact existing `ViewModel` shape so the
 *     `data-view.tsx` render logic is unchanged.
 */
export function useDataViewModel(
  storageKey: string,
  contributions: SealContributions<DataViewContribution>[],
  views: string[] | undefined,
  hasHierarchy: boolean,
  viewOptions: Record<string, unknown> | undefined,
  defaultView: string | undefined,
): ViewModel {
  const core = useViewModel<DataViewContribution>(
    storageKey,
    dataViewDescriptors,
    contributions,
    views,
    hasHierarchy,
    viewOptions,
    defaultView,
  );
  const ephemeral = useViewEphemeral(storageKey);

  const sortFor = useCallback(
    (id: string): SortState | null => readSort(core.viewFor(id)),
    [core],
  );
  const filterFor = useCallback(
    (id: string): FilterGroup | null => readFilter(core.viewFor(id)),
    [core],
  );

  const setSort = useCallback(
    (id: string, fieldId: string) => {
      const cur = readSort(core.viewFor(id));
      // null → asc → desc → null cycle (matches use-data-table.toggleSort).
      let sort: SortState | null;
      if (cur?.fieldId !== fieldId) sort = { fieldId, direction: "asc" };
      else if (cur.direction === "asc") sort = { fieldId, direction: "desc" };
      else sort = null;
      core.updateView(id, { sort } as unknown as VariantValue, { merge: true });
    },
    [core],
  );

  const setFilter = useCallback(
    (id: string, filter: FilterGroup | null) => {
      core.updateView(id, { filter } as unknown as VariantValue, {
        merge: true,
      });
    },
    [core],
  );

  const stateFor = useCallback(
    (id: string): ViewState => {
      const local = ephemeral.localFor(id);
      return {
        sort: sortFor(id),
        filter: filterFor(id),
        query: local.query,
        expanded: local.expanded,
      };
    },
    [ephemeral, sortFor, filterFor],
  );

  const actions = useMemo<ViewActions>(
    () => ({
      available: core.actions.available,
      addView: core.actions.addView,
      renameView: core.actions.renameView,
      duplicateView: core.actions.duplicateView,
      deleteView: core.actions.deleteView,
      reorderView: core.actions.reorderView,
      updateView: core.actions.updateView,
    }),
    [core.actions],
  );

  return useMemo(
    () => ({
      instances: core.instances,
      activeId: core.activeId,
      setActiveView: core.setActiveView,
      stateFor,
      setSort,
      setFilter,
      setQuery: ephemeral.setQuery,
      setExpanded: ephemeral.setExpanded,
      actions,
    }),
    [core, stateFor, setSort, setFilter, ephemeral, actions],
  );
}
