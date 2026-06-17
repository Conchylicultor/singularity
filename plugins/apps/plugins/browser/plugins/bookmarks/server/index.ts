import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { browserBookmarksServerResource } from "./internal/resource";
import { handleAddBookmark, handleDeleteBookmark } from "./internal/routes";
import { addBookmark, deleteBookmark } from "../shared/endpoints";

export { _browserBookmarks } from "./internal/tables";
export { addBookmark, deleteBookmark } from "./internal/mutations";
export { browserBookmarksServerResource } from "./internal/resource";

export default {
  description:
    "Browser bookmarks: the browser_bookmarks table, the browser-bookmarks live resource, and add/delete endpoints backing the star toggle and bookmarks bar.",
  contributions: [Resource.Declare(browserBookmarksServerResource)],
  httpRoutes: {
    [addBookmark.route]: handleAddBookmark,
    [deleteBookmark.route]: handleDeleteBookmark,
  },
} satisfies ServerPluginDefinition;
