import { useCallback, useMemo } from "react";
import type { ComponentType } from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import type { VariantValue } from "@plugins/fields/plugins/variant/core";
import type { FilterGroup, ViewState } from "../../core";
import type { DataViewContribution } from "../slots";
import { useEphemeralViewState } from "./use-view-state";
import { useResolvedInstances } from "./resolve-instances";
import type { ResolvedViewInstance } from "./resolve-instances";
import { useViewsConfig } from "./use-views-config";

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
  updateView: (id: string, view: VariantValue) => void;
}

/** The unified host contract — both modes produce one of these. */
export interface ViewModel {
  instances: ResolvedViewInstance[];
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

/** Resolve the active instance id given the persisted selection + fallbacks. */
function resolveActiveId(
  instances: ResolvedViewInstance[],
  persisted: string | null,
  defaultView: string | undefined,
): string {
  const byPersisted = instances.find((r) => r.instance.id === persisted);
  if (byPersisted) return byPersisted.instance.id;
  const byDefault = instances.find((r) => r.instance.id === defaultView);
  if (byDefault) return byDefault.instance.id;
  return instances[0]?.instance.id ?? "";
}

/**
 * The single view model: config-authored instances, durable sort/filter written
 * back to the instance's config row, full instance actions. active-id / query /
 * expand stay device-local via the ephemeral store.
 */
export function useConfigViewModel(
  storageKey: string,
  contributions: SealContributions<DataViewContribution>[],
  views: string[] | undefined,
  hasHierarchy: boolean,
  viewOptions: Record<string, unknown> | undefined,
  defaultView: string | undefined,
): ViewModel {
  // The synthesized defaults seed config materialization (display-only pre-edit).
  const defaults = useResolvedInstances(
    contributions,
    views,
    hasHierarchy,
    viewOptions,
  );
  const cfg = useViewsConfig(
    storageKey,
    contributions,
    hasHierarchy,
    viewOptions,
    defaults,
  );
  const ephemeral = useEphemeralViewState(storageKey);

  const activeId = resolveActiveId(
    cfg.instances,
    ephemeral.activeViewId,
    defaultView,
  );

  const stateFor = useCallback(
    (id: string): ViewState => {
      const local = ephemeral.localFor(id);
      return {
        sort: cfg.sortFor(id),
        filter: cfg.filterFor(id),
        query: local.query,
        expanded: local.expanded,
      };
    },
    [ephemeral, cfg],
  );

  // Capability-gated add menu: registered contributions ∩ `views` whitelist (if
  // present) ∩ hierarchical gate. Generic — driven by contributions, never by a
  // named view child.
  const available = useMemo<AddableViewType[]>(() => {
    const usable = (hasHierarchy
      ? contributions
      : contributions.filter((c) => !c.hierarchical)
    ).filter((c) => (views ? views.includes(c.type) : true));
    return usable
      .slice()
      .sort(
        (a, b) =>
          (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title),
      )
      .map((c) => ({ type: c.type, title: c.title, icon: c.icon }));
  }, [contributions, views, hasHierarchy]);

  const actions = useMemo<ViewActions>(
    () => ({
      available,
      addView: cfg.addView,
      renameView: cfg.renameView,
      duplicateView: cfg.duplicateView,
      deleteView: cfg.deleteView,
      reorderView: cfg.reorderView,
      updateView: cfg.updateView,
    }),
    [available, cfg],
  );

  return useMemo(
    () => ({
      instances: cfg.instances,
      activeId,
      setActiveView: ephemeral.setActiveView,
      stateFor,
      setSort: cfg.setSort,
      setFilter: cfg.setFilter,
      setQuery: ephemeral.setQuery,
      setExpanded: ephemeral.setExpanded,
      actions,
    }),
    [cfg, activeId, ephemeral, stateFor, actions],
  );
}
