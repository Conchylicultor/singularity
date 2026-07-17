import { useMemo } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { PageRow } from "@plugins/page/plugins/editor/core";
import { starredPagesResource } from "../../shared/resources";

/**
 * Field extension contributed into the page-tree's `PageTree.Fields` factory: a
 * render-callback component that reads this plugin's own live starred-pages
 * resource into a `Set<string>` and yields one `starred` bool `FieldDef<PageRow>`
 * closed over the set. Because the field carries a synchronous `value`
 * projection, it shows up in the DataView's Filter pill for free — so the
 * "Favorites" view is just a filtered `list` view over `starred`, with no
 * bespoke sidebar. While the resource is `pending` the set is empty (same as
 * today's hide-while-pending behavior).
 */
export function StarredField({ render }: FieldExtensionProps<PageRow>) {
  const result = useResource(starredPagesResource);
  // An empty set while pending is genuinely correct, and is the LEAST wrong of
  // the three options: Favorites filters `starred is true`, so an empty set
  // renders an empty list until the resource settles — exactly what the old
  // FavoritesSidebar did by returning null. Abstaining instead (yielding no
  // field) would leave the view's filter rule unresolvable, and `evaluateNode`
  // fail-softs an unresolvable rule to `true` — flashing EVERY page.
  const set = useMemo(() => {
    if (result.pending) return new Set<string>();
    return new Set(result.data.map((r) => r.parentId));
  }, [result]);
  const fields = useMemo<FieldDef<PageRow>[]>(
    () => [
      {
        id: "starred",
        label: "Starred",
        type: "bool",
        value: (b) => set.has(b.id),
        // Search-accessor only: keeping `starred` out of the full-text search
        // accessor (it is a filter dimension, not searchable text). It stays in
        // the Filter pill, which is gated on the field type resolving operators.
        filterable: false,
        // A group-by silently disables `rowOrderEnabled`, which would suspend
        // the Favorites drag order with no visible cause — so never groupable.
        groupable: false,
      },
    ],
    [set],
  );
  return <>{render(fields)}</>;
}
