import { useCallback, useMemo } from "react";
import type { VariantValue } from "@plugins/fields/plugins/variant/core";
import { useViewModel } from "@plugins/primitives/plugins/data-view/plugins/view-core/web";
import type { ResolvedViewInstance } from "@plugins/primitives/plugins/data-view/plugins/view-core/web";
import type {
  AddableSource,
  ViewSourceEntry,
} from "@plugins/primitives/plugins/data-view/plugins/view-core/core";
import type { ExpandChange } from "@plugins/primitives/plugins/tree/core";
import type { FilterGroup, GroupByRule, SortRule, ViewState } from "../../core";
import type { DataViewContribution } from "../slots";
import { cyclePrimarySort } from "./sort-cycle";
import { isFilterGroup } from "./filter-shape";
import { dataViewDescriptors } from "./descriptors";
import { IDENTITY_GROUPING } from "./identity-grouping";
import { useViewEphemeral } from "./use-view-ephemeral";

/** Instance actions for the editable view-switcher (every DataView has these). */
export interface ViewActions {
  /** Add-menu groups, one per source entry (each entry's registered
   *  contributions ∩ `views` whitelist ∩ hierarchical gate). A single-source
   *  DataView yields exactly one untitled group — the flat-menu fast path. */
  availableSources: AddableSource[];
  addView: (type: string, sourceId?: string) => void;
  renameView: (id: string, name: string) => void;
  duplicateView: (id: string) => void;
  deleteView: (id: string) => void;
  reorderView: (id: string, toIndex: number) => void;
  updateView: (
    id: string,
    view: VariantValue,
    opts?: { merge?: boolean },
  ) => void;
}

/**
 * The SETTLED host contract — the model once the surface's authored views are
 * known. Everything downstream of the shell (`DataViewBody`, the controls
 * context) takes this, never the union below, so the loading arm cannot reach a
 * renderer that has no way to express it.
 */
export interface ReadyViewModel {
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
  /** Set (or clear with `null`) THIS view's group-by rule (field + grouping). */
  setGroupBy: (id: string, rule: GroupByRule | null) => void;
  setQuery: (id: string, q: string) => void;
  /** Apply a whole expand/collapse batch to THIS view (one localStorage write). */
  setExpanded: (id: string, changes: readonly ExpandChange[]) => void;
  /** Device-local collapsed group-by section keys for THIS view. */
  collapsedSectionsFor: (id: string) => ReadonlySet<string>;
  /** Collapse/expand a group-by section for THIS view (device-local). */
  setSectionCollapsed: (id: string, key: string, collapsed: boolean) => void;
  /** Instance actions for the editable switcher (always present). */
  actions: ViewActions;
}

/**
 * What `useDataViewModel` returns: either "the views are not known yet" or the
 * settled model. A UNION, not a `ready` flag beside the data, because the two
 * states are otherwise indistinguishable — an unknown surface and a surface
 * with no views both have zero instances, and the host that renders
 * "No views configured" for the second one has no way to notice it is looking
 * at the first. Narrowing is the enforcement: nothing downstream accepts the
 * loading arm, so a host must answer it before it can render anything.
 */
export type ViewModel = { ready: false } | (ReadyViewModel & { ready: true });

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
 * Read the host-managed group-by choice off a row's raw variant value, coercing
 * every persisted form into a `GroupByRule`. Migrate-on-read — NEVER destructive
 * (the config is re-serialized to the object shape only when the user edits
 * group-by):
 *   - new object shape → as-is, defaulting a missing `groupingId` to the
 *     built-in identity grouping (a hand-authored `{ "fieldId": "startsAt" }`
 *     is a legitimate config, not a broken one);
 *   - legacy bare `"<fieldId>"` string → `{ fieldId, groupingId: "value" }`,
 *     which IS what that string always meant (one section per distinct value);
 *   - null / absent / anything else → `undefined` (ungrouped).
 */
function readGroupBy(view: VariantValue | undefined): GroupByRule | undefined {
  const raw = view?.groupBy;
  if (typeof raw === "string") {
    return raw.length > 0
      ? { fieldId: raw, groupingId: IDENTITY_GROUPING.id }
      : undefined;
  }
  if (raw && typeof raw === "object") {
    const { fieldId, groupingId } = raw as Partial<GroupByRule>;
    if (typeof fieldId !== "string" || fieldId.length === 0) return undefined;
    return {
      fieldId,
      groupingId:
        typeof groupingId === "string" && groupingId.length > 0
          ? groupingId
          : IDENTITY_GROUPING.id,
    };
  }
  return undefined;
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
 *
 * `entries` is the ordered source-entry list. The single-source `<DataView>`
 * shell builds one implicit entry from its own props; `MergedDataView` builds
 * one entry per contributed source (static metadata only — no `viewOptions`).
 * Pass a referentially-stable (memoized) array.
 */
export function useDataViewModel(
  storageKey: string,
  entries: ViewSourceEntry<DataViewContribution>[],
  defaultView: string | undefined,
  pinnedView?: string,
): ViewModel {
  const core = useViewModel<DataViewContribution>(
    storageKey,
    dataViewDescriptors,
    entries,
    defaultView,
    pinnedView,
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
      // An empty rule list is semantically "no sort" — omit the key rather than
      // persist `sort: []`, so the config row stays terse (mergeView drops
      // undefined keys).
      core.updateView(
        id,
        { sort: rules.length ? rules : undefined } as unknown as VariantValue,
        { merge: true },
      );
    },
    [core],
  );

  const setSort = useCallback(
    (id: string, fieldId: string) => {
      // Header shortcut: cycle the PRIMARY rule, preserving secondary rules.
      // Cycling can empty the rule list (primary desc + no secondary) — omit the
      // key in that case instead of persisting `sort: []`.
      const next = cyclePrimarySort(readSortRules(core.viewFor(id)), fieldId);
      core.updateView(
        id,
        { sort: next.length ? next : undefined } as unknown as VariantValue,
        { merge: true },
      );
    },
    [core],
  );

  const setVisibleFields = useCallback(
    (id: string, ids: string[] | null) => {
      // A reset-to-show-all passes `null` (and an empty array is likewise "no
      // explicit policy") — omit the key so the row falls back to show-all.
      core.updateView(
        id,
        {
          visibleFields: ids && ids.length ? ids : undefined,
        } as unknown as VariantValue,
        { merge: true },
      );
    },
    [core],
  );

  const setFilter = useCallback(
    (id: string, filter: FilterGroup | null) => {
      // A null filter or an empty group is semantically "no filter" — omit the
      // key rather than persist `filter: null` / `filter: { children: [] }`.
      const isEmptyFilter =
        filter == null ||
        (isFilterGroup(filter) && filter.children.length === 0);
      core.updateView(
        id,
        {
          filter: isEmptyFilter ? undefined : filter,
        } as unknown as VariantValue,
        { merge: true },
      );
    },
    [core],
  );

  const setGroupBy = useCallback(
    (id: string, rule: GroupByRule | null) => {
      // "Ungrouped" omits the key rather than persisting `groupBy: null`
      // (mergeView drops undefined keys), exactly like an empty sort/filter.
      core.updateView(
        id,
        { groupBy: rule ?? undefined } as unknown as VariantValue,
        {
          merge: true,
        },
      );
    },
    [core],
  );

  const collapsedSectionsFor = useCallback(
    (id: string): ReadonlySet<string> =>
      new Set(ephemeral.localFor(id).collapsedSections),
    [ephemeral],
  );

  const stateFor = useCallback(
    (id: string): ViewState => {
      const local = ephemeral.localFor(id);
      return {
        sort: sortFor(id),
        filter: filterFor(id),
        visibleFields: readVisibleFields(core.viewFor(id)),
        groupBy: readGroupBy(core.viewFor(id)),
        query: local.query,
        expanded: local.expanded,
      };
    },
    [core, ephemeral, sortFor, filterFor],
  );

  const actions = useMemo<ViewActions>(
    () => ({
      availableSources: core.actions.availableSources,
      addView: core.actions.addView,
      renameView: core.actions.renameView,
      duplicateView: core.actions.duplicateView,
      deleteView: core.actions.deleteView,
      reorderView: core.actions.reorderView,
      updateView: core.actions.updateView,
    }),
    [core.actions],
  );

  const model = useMemo(
    (): ReadyViewModel => ({
      instances: core.instances,
      activeId: core.activeId,
      setActiveView: core.setActiveView,
      stateFor,
      setSort,
      setSortRules,
      setVisibleFields,
      setFilter,
      setGroupBy,
      setQuery: ephemeral.setQuery,
      setExpanded: ephemeral.setExpanded,
      collapsedSectionsFor,
      setSectionCollapsed: ephemeral.setSectionCollapsed,
      actions,
    }),
    [
      core,
      stateFor,
      setSort,
      setSortRules,
      setVisibleFields,
      setFilter,
      setGroupBy,
      collapsedSectionsFor,
      ephemeral,
      actions,
    ],
  );

  // The union is minted here, at the ONE place that knows whether the authored
  // views are known: `core.ready` is false only while the config document has
  // not arrived. Every hook above ran unconditionally, so this is a pure
  // narrowing of an already-built model, not a second code path.
  return useMemo(
    (): ViewModel =>
      core.ready ? { ready: true, ...model } : { ready: false },
    [core.ready, model],
  );
}
