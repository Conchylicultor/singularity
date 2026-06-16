import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { starredPagesServerResource } from "./internal/resource";
import { handlePutPageStarred, handleMovePageStarred } from "./internal/routes";
import { putPageStarred, movePageStarred } from "../shared/endpoints";

export { pageBlocksStarred } from "./internal/tables";
export { setPageStarred, movePageStarred } from "./internal/mutations";
export { starredPagesServerResource } from "./internal/resource";

export default {
  description:
    "Starred-pages side-table (page_blocks_ext_starred), live resource, and toggle/reorder endpoints for the Pages Favorites section.",
  contributions: [Resource.Declare(starredPagesServerResource)],
  httpRoutes: {
    [putPageStarred.route]: handlePutPageStarred,
    [movePageStarred.route]: handleMovePageStarred,
  },
} satisfies ServerPluginDefinition;
