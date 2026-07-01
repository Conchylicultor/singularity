import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Browser } from "@plugins/apps/plugins/browser/plugins/shell/web";
import { BookmarkStar } from "./components/bookmark-star";
import { BookmarksBar } from "./components/bookmarks-bar";

export { useBookmarks } from "./internal/use-bookmarks";
export {
  browserBookmarksResource,
  BookmarkRowSchema,
  type BookmarkRow,
} from "../core/resources";

export default {
  description:
    "Browser bookmarks UI: a star toggle in the chrome actions and a bookmarks bar of clickable chips below the omnibox.",
  contributions: [
    Browser.Actions({ id: "bookmark-star", component: BookmarkStar }),
    Browser.SubBar({ id: "bookmarks-bar", component: BookmarksBar }),
  ],
} satisfies PluginDefinition;
