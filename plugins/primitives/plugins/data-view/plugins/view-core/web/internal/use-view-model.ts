import { useMemo } from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import type { VariantValue } from "@plugins/fields/plugins/variant/core";
import type { AddableViewType, ViewTypeMeta } from "../../core";
import type { ResolvedViewInstance } from "./resolve-instances";
import { useViewsConfig } from "./use-views-config";
import { useActiveViewId } from "./use-active-view";

/**
 * Instance actions for the editable view-switcher (every view surface has
 * these). `updateView` is opaque about the variant value — the host layers
 * sort/filter on top of it.
 */
export interface ViewActionsCore {
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

/**
 * The generic, type-agnostic view model. Owns the instance list, active-id
 * resolution, and raw `view` read/write — but knows NOTHING about
 * sort/filter/query/expand. A consumer (e.g. data-view) wraps it to layer those
 * render concerns on top.
 */
export interface ViewModelCore<T extends ViewTypeMeta = ViewTypeMeta> {
  instances: ResolvedViewInstance<T>[];
  activeId: string;
  setActiveView: (id: string) => void;
  /** Raw `view` value for one instance (the variant blob), or the seed `{type}`
   *  for a not-yet-materialized default. `undefined` only for an unknown id. */
  viewFor: (id: string) => VariantValue | undefined;
  updateView: (id: string, view: VariantValue, opts?: { merge?: boolean }) => void;
  actions: ViewActionsCore;
  /** Capability-gated add menu (registered ∩ whitelist ∩ hierarchical gate). */
  available: AddableViewType[];
}

/** Resolve the active instance id given the persisted selection + fallbacks. */
function resolveActiveId<T extends ViewTypeMeta>(
  instances: ResolvedViewInstance<T>[],
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
 * The single generic view model: config-authored instances, raw view read/write,
 * full instance actions. active-id stays device-local via `useActiveViewId`.
 * Opaque about per-instance options (`sort`/`filter`/query/expand are the host's
 * concern).
 */
export function useViewModel<T extends ViewTypeMeta>(
  storageKey: string,
  descriptorMap: Map<string, ConfigDescriptor>,
  contributions: SealContributions<T>[],
  views: string[] | undefined,
  hasHierarchy: boolean,
  viewOptions: Record<string, unknown> | undefined,
  defaultView: string | undefined,
): ViewModelCore<T> {
  // Config is the single source of truth — no synthesized defaults. The instance
  // list comes only from the authored config rows (terse `{ name, view }`,
  // normalized on read). `useResolvedInstances` is no longer used here; the
  // addable-types menu (`available`, below) is derived straight from the
  // contributions — that is "what view-types exist", not "default instances".
  const cfg = useViewsConfig(
    storageKey,
    descriptorMap,
    contributions,
    hasHierarchy,
    viewOptions,
  );
  const active = useActiveViewId(storageKey);

  const activeId = resolveActiveId(
    cfg.instances as ResolvedViewInstance<T>[],
    active.activeViewId,
    defaultView,
  );

  // Capability-gated add menu: registered contributions ∩ `views` whitelist (if
  // present) ∩ hierarchical gate. Generic — driven by contributions, never by a
  // named view child.
  const available = useMemo<AddableViewType[]>(() => {
    const usable = (
      hasHierarchy ? contributions : contributions.filter((c) => !c.hierarchical)
    ).filter((c) => (views ? views.includes(c.type) : true));
    return usable
      .slice()
      .sort(
        (a, b) =>
          (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title),
      )
      .map((c) => ({ type: c.type, title: c.title, icon: c.icon }));
  }, [contributions, views, hasHierarchy]);

  const actions = useMemo<ViewActionsCore>(
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
      instances: cfg.instances as ResolvedViewInstance<T>[],
      activeId,
      setActiveView: active.setActiveView,
      viewFor: cfg.viewFor,
      updateView: cfg.updateView,
      actions,
      available,
    }),
    [cfg, activeId, active.setActiveView, actions, available],
  );
}
