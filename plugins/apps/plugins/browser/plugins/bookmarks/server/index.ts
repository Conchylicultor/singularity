import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { IdKinds } from "@plugins/ids/server";
import { bookmarkIdKind } from "../core";
import { browserBookmarksServed } from "./internal/resource";
import { handleAddBookmark, handleDeleteBookmark } from "./internal/routes";
import { addBookmark, deleteBookmark } from "../shared/endpoints";

export { _browserBookmarks } from "./internal/tables";
export { addBookmark, deleteBookmark } from "./internal/mutations";

export default {
  description:
    "Browser bookmarks: the browser_bookmarks table, the browser-bookmarks live collection, and add/delete endpoints backing the star toggle and bookmarks bar.",
  contributions: [
    IdKinds.Kind({ kind: bookmarkIdKind }),
    ...browserBookmarksServed.declare,
  ],
  httpRoutes: {
    [addBookmark.route]: handleAddBookmark,
    [deleteBookmark.route]: handleDeleteBookmark,
  },
} satisfies ServerPluginDefinition;
