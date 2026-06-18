import { useMemo } from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import type { ViewInstance, ViewConfigRow, ViewTypeMeta } from "../../core";

/** A resolved view-instance paired with the view-type that renders it. */
export interface ResolvedViewInstance<T extends ViewTypeMeta = ViewTypeMeta> {
  instance: ViewInstance;
  viewType: SealContributions<T>;
}

/**
 * Default-instances resolver. Reproduces the `available` view resolution (drop
 * hierarchical types when no hierarchy; honor the `views` whitelist for
 * inclusion + order, else sort by `order ?? 0` then title) and synthesizes
 * exactly one instance per resolved view-type (`id === type`, `name === title`).
 * Type-agnostic — it knows only the contributions + the
 * `views`/`hierarchy`/`viewOptions` inputs, never `FieldDef`/rows.
 */
export function useResolvedInstances<T extends ViewTypeMeta>(
  contributions: SealContributions<T>[],
  views: string[] | undefined,
  hasHierarchy: boolean,
  viewOptions: Record<string, unknown> | undefined,
): ResolvedViewInstance<T>[] {
  return useMemo<ResolvedViewInstance<T>[]>(() => {
    const usable = hasHierarchy
      ? contributions
      : contributions.filter((c) => !c.hierarchical);
    const resolved = views
      ? views
          .map((type) => usable.find((c) => c.type === type))
          .filter((c): c is SealContributions<T> => c !== undefined)
      : [...usable].sort(
          (a, b) =>
            (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title),
        );
    return resolved.map((viewType) => ({
      instance: {
        id: viewType.type,
        name: viewType.title,
        type: viewType.type,
        options: viewOptions?.[viewType.type],
      },
      viewType,
    }));
  }, [contributions, views, hasHierarchy, viewOptions]);
}

/**
 * Build a resolved instance from a config row. Looks up the contribution by
 * `view.type`; **fail-soft** returns `null` when:
 *   - no view-type is registered for `view.type` (an *orphan* row — a renamed /
 *     removed view-type id, same documented hazard as reorder node-type ids), or
 *   - the view-type is hierarchical but the data source has no hierarchy.
 *
 * The row's whole `view` value is layered **over** the consumer's code-supplied
 * `viewOptions[type]` to become the instance `options`: config-authored keys
 * (`sort`/`filter`/`coverField`/…) override, while non-serializable code-only
 * options (e.g. `renderCard`, `cover`) — which can never live in a config row —
 * survive. The view-type component reads its own keys off the merged result.
 */
export function buildInstanceFromRow<T extends ViewTypeMeta>(
  row: ViewConfigRow,
  contributions: SealContributions<T>[],
  hasHierarchy: boolean,
  viewOptions?: Record<string, unknown>,
): ResolvedViewInstance<T> | null {
  const viewType = contributions.find((c) => c.type === row.view.type);
  if (!viewType) return null;
  if (viewType.hierarchical && !hasHierarchy) return null;
  return {
    instance: {
      id: row.id,
      name: row.name,
      type: row.view.type,
      options: {
        ...((viewOptions?.[row.view.type] as object | undefined) ?? {}),
        ...(row.view as object),
      },
    },
    viewType,
  };
}
