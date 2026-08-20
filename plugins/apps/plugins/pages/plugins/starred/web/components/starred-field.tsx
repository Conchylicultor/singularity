import { useMemo } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import type { PageRow } from "@plugins/page/plugins/editor/core";
import { useStarredPageIds } from "../internal/use-starred-ids";

/**
 * Field extension contributed into the page-tree's `PageTree.Fields` factory: a
 * render-callback component that reads this plugin's own bounded favorites
 * window and yields one `starred` bool `FieldDef<PageRow>` closed over the id
 * set. Because the field carries a synchronous `value` projection, it shows up
 * in the DataView's Filter pill for free — so the "Favorites" view is just a
 * filtered `list` view over `starred`, with no bespoke sidebar.
 *
 * The whole-set read is exactly why this resource is a bounded WINDOW rather
 * than a point resource: the field must project `starred` for every row the
 * DataView filters over, and naming every page id would be O(pages). See
 * `shared/resources.ts`.
 */
export function StarredField({ render }: FieldExtensionProps<PageRow>) {
  // An empty set while pending is genuinely correct, and is the LEAST wrong of
  // the three options: Favorites filters `starred is true`, so an empty set
  // renders an empty list until the resource settles — exactly what the old
  // FavoritesSidebar did by returning null. Abstaining instead (yielding no
  // field) would leave the view's filter rule unresolvable, and `evaluateNode`
  // fail-softs an unresolvable rule to `true` — flashing EVERY page.
  const { ids } = useStarredPageIds();
  const fields = useMemo<FieldDef<PageRow>[]>(
    () => [
      {
        id: "starred",
        label: "Starred",
        type: "bool",
        value: (b) => ids.has(b.id),
        // Search-accessor only: keeping `starred` out of the full-text search
        // accessor (it is a filter dimension, not searchable text). It stays in
        // the Filter pill, which is gated on the field type resolving operators.
        filterable: false,
      },
    ],
    [ids],
  );
  return <>{render(fields)}</>;
}
