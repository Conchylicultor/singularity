import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import type { ViewSourceEntry, ViewTypeMeta } from "../../core";

/**
 * The view-types one source entry can actually render, in menu order:
 * that entry's registered contributions ∩ its `views` whitelist ∩ the
 * hierarchical gate (`hierarchical` types need `hasHierarchy`).
 *
 * **The ONE gate.** Both places that offer a type to the user read it — the `+`
 * add menu (`availableSources`) and the active view's settings popover
 * (`variantsFor`). They used to disagree: the add menu filtered, the settings
 * popover was handed the whole global registry, so a flat surface could not
 * *create* a tree view but could *switch* one into a tree — and
 * `buildInstanceFromRow` then dropped that row on the floor (a hierarchical type
 * with no hierarchy resolves to `null`), so the view silently vanished from the
 * switcher while its config row stayed on disk. One gate, two callers, so the
 * two can no longer drift.
 */
export function usableTypes<T extends ViewTypeMeta>(
  entry: ViewSourceEntry<T>,
): SealContributions<T>[] {
  return (
    entry.hasHierarchy
      ? entry.contributions
      : entry.contributions.filter((c) => !c.hierarchical)
  )
    .filter((c) => (entry.views ? entry.views.includes(c.type) : true))
    .slice()
    .sort(
      (a, b) =>
        (a.order ?? 0) - (b.order ?? 0) || a.title.localeCompare(b.title),
    );
}
