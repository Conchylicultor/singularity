import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import type { ViewInstance, ViewConfigRow, ViewTypeMeta } from "../../core";

/** A resolved view-instance paired with the view-type that renders it. */
export interface ResolvedViewInstance<T extends ViewTypeMeta = ViewTypeMeta> {
  instance: ViewInstance;
  viewType: SealContributions<T>;
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
