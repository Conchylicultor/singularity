import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { starredPagesServed } from "./internal/resource";
import { handlePutPageStarred } from "./internal/routes";
import { putPageStarred } from "../shared/endpoints";

export { pageBlocksStarred } from "./internal/tables";
export { setPageStarred } from "./internal/mutations";

export default {
  description:
    "Starred-pages side-table (page_blocks_ext_starred): presence-only marker plus the star toggle endpoint. Contributes a `starred` bool field into the Pages sidebar DataView.",
  contributions: [...starredPagesServed.declare],
  httpRoutes: {
    [putPageStarred.route]: handlePutPageStarred,
  },
} satisfies ServerPluginDefinition;
