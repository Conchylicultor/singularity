import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { _tasks } from "@plugins/tasks-core/server/internal/tables";

// One row per (fingerprint, worktree). Upserts atomically dedupe repeats:
// first crash inserts + creates a task; repeats bump count and advance
// last_seen_at. See research/2026-04-21-global-crashes-plugin.md.
export const _crashes = pgTable(
  "crashes",
  {
    id: text("id").primaryKey(),
    fingerprint: text("fingerprint").notNull(),
    worktree: text("worktree").notNull(),
    source: text("source").notNull(),
    errorType: text("error_type"),
    message: text("message").notNull(),
    stack: text("stack"),
    componentStack: text("component_stack"),
    url: text("url"),
    userAgent: text("user_agent"),
    slot: text("slot"),
    label: text("label"),
    count: integer("count").notNull().default(1),
    crashLoop: boolean("crash_loop").notNull().default(false),
    taskId: text("task_id").references(() => _tasks.id, { onDelete: "set null" }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("crashes_fingerprint_worktree_idx").on(t.fingerprint, t.worktree),
    index("crashes_task_id_idx").on(t.taskId),
  ],
);
