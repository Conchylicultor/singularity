import { asc } from "drizzle-orm";
import { queryResource } from "@plugins/infra/plugins/query-resource/server";
import { browserBookmarksResource as browserBookmarksDescriptor } from "../../core/resources";
import { _browserBookmarks } from "./tables";

// Compiled keyed query-resource: the loader, Layer-2 scoped loader, and
// identityTable ("browser_bookmarks") all derive from this one declaration.
// Select-all is byte-identical to the wire schema by construction — the table
// and `BookmarkRow` both derive from `bookmarkFields`, which has no server-only
// columns. `createdAt asc` is insert-immutable, so an in-place UPDATE (a title
// change) never reorders — its scoped delta swaps the row in place.
//
// `scopedMembership: true` (M5): the single-user bookmark list is bounded by the
// domain, so the whole-array wire shape is the right one — this just makes the
// add/remove-a-bookmark path incremental. Adding/deleting a bookmark is a
// membership change; without this it forced a whole-list FULL recompute, and
// bookmarks churn purely by INSERT/DELETE (star / unstar). Now an INSERT enters
// via the derived `orderOf` and a DELETE ships a delete + order with no loader
// run, so a star toggle ships one row instead of the whole bar.
export const browserBookmarksServerResource = queryResource(
  browserBookmarksDescriptor,
  {
    from: _browserBookmarks,
    orderBy: asc(_browserBookmarks.createdAt),
    scopedMembership: true,
  },
);
