import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { _blocks } from "@plugins/page/plugins/editor/server";

// `page_blocks_ext_starred`: presence = starred. No order column — the Favorites
// view's row order lives in data-view's `view-order`.
export const pageBlocksStarred = defineExtension(_blocks, "starred", {});
// Re-exported so drizzle-kit discovers the underlying pgTable.
export const _pageBlocksStarredExt = pageBlocksStarred.table;
