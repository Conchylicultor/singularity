import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Operation ledger: one row per trashed ROOT entity (a bulk delete of two
// sub-pages = two independently-restorable entries). Domain-agnostic — the
// primitive never knows what a `source_id` names or what `root_entity_id`
// points at; `meta` is an opaque per-source payload. There is deliberately NO
// foreign key to any consumer table (mirror of `entity_versions`' decoupling):
// the domain rows carry their own `deleted_at` flags, and the ledger row is the
// handle to restore or purge them. The (source_id, deleted_at) index serves the
// per-source trash listing (newest first) and the TTL purge sweep.
export const _trashEntries = pgTable(
  "trash_entries",
  {
    id: text("id").primaryKey(), // crypto.randomUUID()
    sourceId: text("source_id").notNull(), // e.g. "pages"
    rootEntityId: text("root_entity_id").notNull(), // the trashed root (a page id)
    label: text("label").notNull(), // display label captured at trash time
    deletedAt: timestamp("deleted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    meta: jsonb("meta").notNull().default({}),
  },
  (t) => [index("trash_entries_source_deleted_idx").on(t.sourceId, t.deletedAt)],
);
