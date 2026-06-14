import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

// Worktree-local holding area for reorder layouts staged as "default for
// everyone". Last-write-wins per slot (slotId PK). Rows are written by the
// stage endpoint, read by the live resource + review section, and consumed
// (deleted) by apply/discard. The materialized `items` ReorderTree is validated
// at apply time, not at write time — see handlers.ts.
export const _reorderStagedDefault = pgTable("reorder_staged_default", {
  slotId: text("slot_id").primaryKey(), // last-write-wins per slot
  pluginId: text("plugin_id").notNull(), // dot-form; server derives the config path
  items: jsonb("items").notNull(), // materialized ReorderTree
  authorId: text("author_id"), // conversation id or null
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
