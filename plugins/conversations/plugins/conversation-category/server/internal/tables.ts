import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { _conversations } from "@plugins/tasks-core/server";

// One row per categorized conversation. Cascades on parent delete so we
// don't keep stale rows after a conversation is dropped. Source distinguishes
// Haiku-assigned (auto) from user-overridden (manual) so a re-classify won't
// clobber an explicit pick — the job checks source before overwriting.
export const _conversationCategories = pgTable("conversation_categories", {
  conversationId: text("conversation_id")
    .primaryKey()
    .references(() => _conversations.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  source: text("source", { enum: ["haiku", "manual"] }).notNull(),
  classifiedAt: timestamp("classified_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
