import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { rankText } from "@plugins/primitives/plugins/rank/server";
import { _blocks } from "@plugins/page/plugins/editor/server";

// `page_blocks_ext_starred`: presence = starred, `rank` orders Favorites.
export const pageBlocksStarred = defineExtension(_blocks, "starred", {
  rank: rankText("rank").notNull(),
});
// Re-exported so drizzle-kit discovers the underlying pgTable.
export const _pageBlocksStarredExt = pageBlocksStarred.table;
