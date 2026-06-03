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

export const _documents = pgTable(
  "page_documents",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    parentId: text("parent_id").references((): AnyPgColumn => _documents.id, {
      onDelete: "cascade",
    }),
    // `rank` is notNull (mirrors page_blocks). Safe for a fresh auto-generated
    // migration with no manual backfill: page_documents is empty in every DB
    // (the debug doc is created lazily, never seeded), so `ADD COLUMN rank
    // rank_text NOT NULL` has no existing rows to violate. Every document
    // mutation handler (create + ensure-debug) always populates it.
    rank: rankText("rank").notNull(),
    expanded: boolean("expanded").notNull().default(true),
    icon: text("icon"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("page_documents_parent_rank_idx").on(t.parentId, t.rank)],
);

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
