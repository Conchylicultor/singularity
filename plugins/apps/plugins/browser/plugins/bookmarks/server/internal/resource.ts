import { asc } from "drizzle-orm";
import { queryResource } from "@plugins/infra/plugins/query-resource/server";
import { browserBookmarksResource as browserBookmarksDescriptor } from "../../core/resources";
import { _browserBookmarks } from "./tables";

// Compiled keyed query-resource: the loader, Layer-2 scoped loader, and
// identityTable ("browser_bookmarks") all derive from this one declaration.
// Select-all is byte-identical to the wire schema by construction — the table
// and `BookmarkRow` both derive from `bookmarkFields`, which has no server-only
// columns. K/scoped is sound: there is no `where`, so membership only changes
// via INSERT/DELETE (→ FULL), and `createdAt asc` is insert-immutable so an
// in-place UPDATE (a title change) never reorders — its scoped delta swaps the
// row in place.
export const browserBookmarksServerResource = queryResource(
  browserBookmarksDescriptor,
  {
    from: _browserBookmarks,
    orderBy: asc(_browserBookmarks.createdAt),
  },
);
