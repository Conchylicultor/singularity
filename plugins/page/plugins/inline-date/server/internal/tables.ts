import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { _blocks } from "@plugins/page/plugins/editor/server";

// One row per inline reminder token (`[[reminder:<id>:<iso>]]`). The row id IS
// the token's UUID, so the text in a block and the schedule stay in lockstep:
// the reconciler (bound to `page.blocksChanged`) inserts a row + schedules a fire
// job when a token appears, and marks the row `canceled` when it disappears. The
// block text is the source of truth; this table only tracks scheduling state.
//
// Both FKs cascade: deleting the block or the whole page reclaims the reminder
// (and the orphaned graphile fire job simply finds no `pending` row and no-ops).
export const _pageReminders = pgTable(
  "page_reminders",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id")
      .notNull()
      .references(() => _blocks.id, { onDelete: "cascade" }),
    blockId: text("block_id")
      .notNull()
      .references(() => _blocks.id, { onDelete: "cascade" }),
    fireAt: timestamp("fire_at", { withTimezone: true }).notNull(),
    // pending | fired | canceled
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("page_reminders_page_idx").on(t.pageId)],
);
