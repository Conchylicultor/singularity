import { index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { _documents } from "@plugins/page/plugins/editor/server";

// Edge table: one row per (source page → target page) link. Built by the
// reindexer from the source document's blocks via the extractor registry.
// Both endpoints FK → page_documents with ON DELETE CASCADE, so deleting a
// page removes every edge it sources or targets. Backlinks are queried by
// `targetDocumentId`, hence the dedicated index on that column.
export const _pageLinks = pgTable(
  "page_links",
  {
    sourceDocumentId: text("source_document_id")
      .notNull()
      .references(() => _documents.id, { onDelete: "cascade" }),
    targetDocumentId: text("target_document_id")
      .notNull()
      .references(() => _documents.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.sourceDocumentId, t.targetDocumentId] }),
    index("page_links_target_idx").on(t.targetDocumentId),
  ],
);
