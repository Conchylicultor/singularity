import { useMemo } from "react";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import type { VariantValue } from "@plugins/fields/plugins/variant/core";
import type {
  AddableSource,
  AddableViewType,
  ViewSourceEntry,
  ViewTypeMeta,
} from "../../core";
import type { ResolvedViewInstance } from "./resolve-instances";
import { useViewsConfig } from "./use-views-config";
import { useActiveViewId } from "@plugins/primitives/plugins/view-switcher/web";

/**
 * Instance actions for the editable view-switcher (every view surface has
 * these). `updateView` is opaque about the variant value — the host layers
 * sort/filter on top of it.
 */
export interface ViewActionsCore {
  /** Add-menu groups, one per source entry (each entry's registered
   *  contributions ∩ `views` whitelist ∩ hierarchical gate). A single-source
   *  surface yields exactly one untitled group — the flat-menu fast path. */
  availableSources: AddableSource[];
  addView: (type: string, sourceId?: string) => void;
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
  /** Capability-gated add menu, grouped per source entry. */
  availableSources: AddableSource[];
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
 *
 * `entries` is the ordered source-entry list; single-source consumers pass one
 * implicit entry (`id`/`title` undefined). Pass a referentially-stable array —
 * the instance list and add menu memoize on it.
 */
export function useViewModel<T extends ViewTypeMeta>(
  storageKey: string,
  descriptorMap: Map<string, ConfigDescriptor>,
  entries: ViewSourceEntry<T>[],
  defaultView: string | undefined,
): ViewModelCore<T> {
  // Config is the single source of truth — no synthesized defaults. The instance
  // list comes only from the authored config rows (terse `{ name, view }`,
  // normalized on read). The addable-types menu (`availableSources`, below) is
  // derived straight from each entry's contributions — that is "what view-types
  // exist per source", not "default instances".
  const cfg = useViewsConfig(storageKey, descriptorMap, entries);
  const active = useActiveViewId(storageKey);

  const activeId = resolveActiveId(
    cfg.instances as ResolvedViewInstance<T>[],
    active.activeViewId,
    defaultView,
  );

  // Capability-gated add menu, grouped per source entry: each group is that
  // entry's registered contributions ∩ `views` whitelist (if present) ∩
  // hierarchical gate. The `views` whitelist gates ADDABILITY only — authored
  // rows of a non-whitelisted type still resolve (see `buildInstanceFromRow`).
  // Generic — driven by the entries, never by a named view child.
  const availableSources = useMemo<AddableSource[]>(() => {
    return entries.map((entry) => {
      const usable = (
        entry.hasHierarchy
          ? entry.contributions
          : entry.contributions.filter((c) => !c.hierarchical)
      ).filter((c) => (entry.views ? entry.views.includes(c.type) : true));
      const types = usable
        .slice()
        .sort(
          (a, b) =>
            (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title),
        )
        .map<AddableViewType>((c) => ({
          type: c.type,
          title: c.title,
          icon: c.icon,
        }));
      return {
        sourceId: entry.id,
        title: entry.title,
        icon: entry.icon,
        types,
      };
    });
  }, [entries]);

  const actions = useMemo<ViewActionsCore>(
    () => ({
      availableSources,
      addView: cfg.addView,
      renameView: cfg.renameView,
      duplicateView: cfg.duplicateView,
      deleteView: cfg.deleteView,
      reorderView: cfg.reorderView,
      updateView: cfg.updateView,
    }),
    [availableSources, cfg],
  );

  return useMemo(
    () => ({
      instances: cfg.instances as ResolvedViewInstance<T>[],
      activeId,
      setActiveView: active.setActiveView,
      viewFor: cfg.viewFor,
      updateView: cfg.updateView,
      actions,
      availableSources,
    }),
    [cfg, activeId, active.setActiveView, actions, availableSources],
  );
}
