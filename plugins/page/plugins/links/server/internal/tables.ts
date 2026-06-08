import { index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { _blocks } from "@plugins/page/plugins/editor/server";

// Edge table: one row per (source page → target page) link. Built by the
// reindexer from the source page's blocks via the extractor registry. Both
// endpoints are `type="page"` blocks; they FK → page_blocks with ON DELETE
// CASCADE, so deleting a page removes every edge it sources or targets.
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
  },
  (t) => [
    primaryKey({ columns: [t.sourcePageId, t.targetPageId] }),
    index("page_links_target_idx").on(t.targetPageId),
  ],
);
