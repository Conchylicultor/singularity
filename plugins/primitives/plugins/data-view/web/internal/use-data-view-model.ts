import { useCallback, useMemo } from "react";
import type { ComponentType } from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import type { VariantValue } from "@plugins/fields/plugins/variant/core";
import { useViewModel } from "@plugins/primitives/plugins/data-view/plugins/view-core/web";
import type { ResolvedViewInstance } from "@plugins/primitives/plugins/data-view/plugins/view-core/web";
import type { FilterGroup, SortRule, ViewState } from "../../core";
import type { DataViewContribution } from "../slots";
import { cyclePrimarySort } from "./sort-cycle";
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
  /** Replace the whole sort-rule list for THIS view. */
  setSortRules: (id: string, rules: SortRule[]) => void;
  /** Replace the per-view visible-fields policy for THIS view (null = show-all). */
  setVisibleFields: (id: string, ids: string[] | null) => void;
  setFilter: (id: string, filter: FilterGroup | null) => void;
  setQuery: (id: string, q: string) => void;
  setExpanded: (id: string, k: string, v: boolean) => void;
  /** Instance actions for the editable switcher (always present). */
  actions: ViewActions;
}

/**
 * Read the host-managed sort rules off a row's raw variant value, coercing every
 * persisted form into a `SortRule[]`. Migrate-on-read — NEVER destructive (the
 * config is re-serialized to the array shape only when the user edits sort):
 *   - new array shape → as-is;
 *   - legacy single `{ fieldId, direction }` object → wrapped in `[obj]`;
 *   - null / absent → `[]`.
 */
function readSortRules(view: VariantValue | undefined): SortRule[] {
  const raw = view?.sort;
  if (Array.isArray(raw)) return raw as SortRule[];
  if (raw && typeof raw === "object") return [raw as SortRule];
  return [];
}
function readFilter(view: VariantValue | undefined): FilterGroup | null {
  return (view?.filter as FilterGroup | null | undefined) ?? null;
}
/**
 * Read the per-view visible-fields policy off a row's raw variant value. Only an
 * actual array is a configured policy; everything else (absent / null / legacy
 * non-array) coerces to `null` = unconfigured (show-all).
 */
function readVisibleFields(view: VariantValue | undefined): string[] | null {
  return Array.isArray(view?.visibleFields)
    ? (view.visibleFields as string[])
    : null;
}

/**
 * data-view's host model. Wraps view-core's generic `useViewModel` and layers the
 * view-content semantics on top:
 *   - `sortFor`/`filterFor` read the host-managed `sort`/`filter` keys off the raw
 *     config row (`viewFor`); `sortFor` migrates legacy single-`sort` → `SortRule[]`,
 *   - `setSort` cycles the PRIMARY rule (preserving secondary rules), `setSortRules`
 *     replaces the whole list, and `setFilter` writes the whole tree — all via
 *     `updateView(id, { sort/filter }, { merge: true })` so the engine preserves
 *     every other key,
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
    (id: string): SortRule[] => readSortRules(core.viewFor(id)),
    [core],
  );
  const filterFor = useCallback(
    (id: string): FilterGroup | null => readFilter(core.viewFor(id)),
    [core],
  );

  const setSortRules = useCallback(
    (id: string, rules: SortRule[]) => {
      core.updateView(id, { sort: rules } as unknown as VariantValue, {
        merge: true,
      });
    },
    [core],
  );

  const setSort = useCallback(
    (id: string, fieldId: string) => {
      // Header shortcut: cycle the PRIMARY rule, preserving secondary rules.
      const next = cyclePrimarySort(readSortRules(core.viewFor(id)), fieldId);
      core.updateView(id, { sort: next } as unknown as VariantValue, {
        merge: true,
      });
    },
    [core],
  );

  const setVisibleFields = useCallback(
    (id: string, ids: string[] | null) => {
      core.updateView(id, { visibleFields: ids } as unknown as VariantValue, {
        merge: true,
      });
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
        visibleFields: readVisibleFields(core.viewFor(id)),
        query: local.query,
        expanded: local.expanded,
      };
    },
    [ephemeral, sortFor, filterFor, core],
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
      setSortRules,
      setVisibleFields,
      setFilter,
      setQuery: ephemeral.setQuery,
      setExpanded: ephemeral.setExpanded,
      actions,
    }),
    [
      core,
      stateFor,
      setSort,
      setSortRules,
      setVisibleFields,
      setFilter,
      ephemeral,
      actions,
    ],
  );
}
