import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// N.B.: The FK to tasks.id is NOT declared here — importing @plugins/tasks-core/server
// would pull generate-title.ts → claude-cli → paths/bins → Bun.which at module level,
// which crashes drizzle-kit's Node.js evaluator. The FK is added as a raw ALTER TABLE
// constraint in the hand-edited migration SQL instead.
// getExtension/upsertExtension from entity-extensions only need t.parentId (a plain text
// column), so the missing ORM-level FK does not affect runtime behavior.
export const _tasksAutoStartExt = pgTable("tasks_ext_auto_start", {
  parentId: text("parent_id").primaryKey(),
  autoStartAt: timestamp("auto_start_at", { withTimezone: true }).notNull(),
  autoStartModel: text("auto_start_model").$type<"opus" | "sonnet">().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
