import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

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
    noise: boolean("noise").notNull().default(false),
    // Attribution (last-writer-wins): the tab + bundle build id of the most
    // recent report for this fingerprint. NOT part of the dedup key.
    lastClientId: text("last_client_id"),
    lastBuildId: text("last_build_id"),
    // Soft reference to tasks.id — the cross-plugin FK would cross a plugin
    // boundary, so we validate integrity in code via getTask() instead. A
    // deleted task just surfaces as `needsTask` on the next crash.
    taskId: text("task_id"),
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
