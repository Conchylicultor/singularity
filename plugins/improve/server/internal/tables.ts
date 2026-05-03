import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Single-row per-worktree config for the Improve plugin. Uses a singleton
// primary key ("default") so we always upsert the same row. We don't use the
// shared `config` scalar table because its rendered UI collapses `\n` in
// <input>, and the prompt template needs multiline editing (see
// plugins/improve/web/components/prompt-template-settings.tsx).
export const _improve_config = pgTable("improve_config", {
  id: text("id").primaryKey(),
  promptTemplate: text("prompt_template").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Tracks which conversation group a submitted task should be added to once its
// conversation is created. Written at submit time; cleared by applyGroupJob
// when the conversationCreated event fires for the task.
export const _improvePendingGroups = pgTable("improve_pending_groups", {
  taskId: text("task_id").primaryKey(),
  groupId: text("group_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Tracks tasks whose first conversation should be promoted to the top of the
// queue when its first turn completes. Written at submit time via
// POST /api/improve/queue-top; cleared by applyQueueTopJob.
export const _improvePendingQueueTop = pgTable("improve_pending_queue_top", {
  taskId: text("task_id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
