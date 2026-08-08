import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { _conversations } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

// One row per (conversation, category) assignment. NOT a 1:1 entity extension:
// a conversation carries one row per configured category, and `defineExtension`
// is structurally 1:1 (its sole primary key IS the parent id).
//
// The primary key is the derived `categoryRowId(conversationId, categoryId)`
// rather than a composite, because the live-state point resource requires its
// subscription key to be a SINGLE-column primary key — see shared/row-id.ts and
// shared/schemas.ts. The unique index on the pair is the writer's guard that the
// derived id and the logical key can never disagree.
export const _conversationCategories = pgTable(
  "conversation_categories",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => _conversations.id, { onDelete: "cascade" }),
    categoryId: text("category_id").notNull(),
    item: text("item").notNull(),
    source: text("source", { enum: ["haiku", "manual"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // The PK index serves point reads (`WHERE id IN (…)`); this one serves the
    // per-conversation reads (the classify job's "what is already set?") and the
    // per-category scan the commits stats does.
    index("conversation_categories_conversation_idx").on(t.conversationId),
    uniqueIndex("conversation_categories_conv_cat_idx").on(
      t.conversationId,
      t.categoryId,
    ),
  ],
);

// TRANSITIONAL — the pre-multi-category 1:1 side table. Nothing reads it; it is
// declared only so this branch's schema delta is a pure CREATE.
//
// It cannot be dropped in the same push that creates `conversation_categories`.
// `push` regenerates every branch-local SCHEMA migration into ONE stamped at
// push time, while leaving DATA migrations at their original timestamps — so a
// backfill reading this table and writing the new one would be ordered BEFORE
// the migration that creates its destination, and would fail on main's boot
// (verified: `migration-applies-clean` reports
// `relation "conversation_categories" does not exist`).
//
// So the swap is expand → migrate → contract across two pushes: this push
// creates the new table, the next one backfills from here and drops this.
export const conversationCategory = defineExtension(
  _conversations,
  "category",
  {
    category: text("category").notNull(),
    source: text("source", { enum: ["haiku", "manual"] }).notNull(),
  },
);
// Re-export the underlying pgTable so drizzle-kit's schema glob picks it up.
export const _conversationCategoryTable = conversationCategory.table;
