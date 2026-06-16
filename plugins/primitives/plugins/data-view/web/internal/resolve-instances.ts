import { useMemo } from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import type { DataViewContribution } from "../slots";
import type { ViewInstance } from "../../core";

/** A resolved view-instance paired with the view-type that renders it. */
export interface ResolvedViewInstance {
  instance: ViewInstance;
  viewType: SealContributions<DataViewContribution>;
}

/**
 * Default-instances resolver. Reproduces today's `available` view resolution
 * (drop hierarchical types when no hierarchy; honor the `views` whitelist for
 * inclusion + order, else sort by `order ?? 0` then title) and synthesizes
 * exactly one instance per resolved view-type (`id === type`, `name === title`).
 * Data-view-agnostic — it knows only the contributions + the
 * `views`/`hierarchy`/`viewOptions` inputs, never `FieldDef`/rows.
 */
export function useResolvedInstances(
  contributions: SealContributions<DataViewContribution>[],
  views: string[] | undefined,
  hasHierarchy: boolean,
  viewOptions: Record<string, unknown> | undefined,
): ResolvedViewInstance[] {
  return useMemo<ResolvedViewInstance[]>(() => {
    const usable = hasHierarchy
      ? contributions
      : contributions.filter((c) => !c.hierarchical);
    const resolved = views
      ? views
          .map((type) => usable.find((c) => c.type === type))
          .filter(
            (c): c is SealContributions<DataViewContribution> =>
              c !== undefined,
          )
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
