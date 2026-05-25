import {
  type AnyPgColumn,
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { rankText } from "@plugins/primitives/plugins/rank/core";

export const _documents = pgTable("page_documents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const _blocks = pgTable(
  "page_blocks",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => _documents.id, { onDelete: "cascade" }),
    parentId: text("parent_id").references((): AnyPgColumn => _blocks.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(),
    data: jsonb("data").notNull().default({}),
    rank: rankText("rank").notNull(),
    expanded: boolean("expanded").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("page_blocks_doc_parent_rank_idx").on(t.documentId, t.parentId, t.rank),
    index("page_blocks_document_id_idx").on(t.documentId),
  ],
);
