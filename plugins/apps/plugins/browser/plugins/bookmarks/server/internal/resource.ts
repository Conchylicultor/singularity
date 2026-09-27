import { serveCollection } from "@plugins/network/plugins/live/server";
import { browserBookmarks } from "../../core";
import { _browserBookmarks } from "./tables";

// The bookmarks collection over `browser_bookmarks`: its window (filterable on
// `url`, sorted by `createdAt`), its `:rows` point sibling and its `:groups`
// value. Every row field is a column by name (the table and `BookmarkRow` both
// derive from `bookmarkFields`, which has no server-only column), so the
// projection is the whole row. Bookmarks churn by INSERT / DELETE (star /
// unstar): each is a bounded membership update of the subscribed windows
// (O(window ∪ changed)), never a read of the whole table.
export const browserBookmarksServed = serveCollection(browserBookmarks, {
  from: _browserBookmarks,
});
