import { index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { _blocks } from "@plugins/page/plugins/editor/server";

// Edge table: one row per (source page → target page, linking block). Built by
// the reindexer from the source page's blocks via the extractor registry. Both
// page endpoints are `type="page"` blocks, and `sourceBlockId` is the content
// block whose data carried the link (the block a backlink's snippet is read
// from). All three FK → page_blocks with ON DELETE CASCADE, so deleting a page
// — or purging the one block that linked — removes the edges it carried.
// Backlinks are queried by `targetPageId`, hence the dedicated index.
export const _pageLinks = pgTable(
  "page_links",
  {
    sourcePageId: text("source_page_id")
      .notNull()
      .references(() => _blocks.id, { onDelete: "cascade" }),
    targetPageId: text("target_page_id")
      .notNull()
      .references(() => _blocks.id, { onDelete: "cascade" }),
    sourceBlockId: text("source_block_id")
      .notNull()
      .references(() => _blocks.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({
      columns: [t.sourcePageId, t.targetPageId, t.sourceBlockId],
    }),
    index("page_links_target_idx").on(t.targetPageId),
  ],
);
