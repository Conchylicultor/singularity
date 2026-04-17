import {
  type AnyPgColumn,
  boolean,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Physical tables that back a `pgView`. In-plugin writers import from here.
// Cross-plugin callers must never import this file — they use `./schema`
// (views + types). Plain tables with no derived view (e.g. `pushes`) live
// in `./schema` directly instead.

export const _tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  parentId: text("parent_id").references((): AnyPgColumn => _tasks.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  description: text("description"),
  droppedAt: timestamp("dropped_at", { withTimezone: true }),
  heldAt: timestamp("held_at", { withTimezone: true }),
  expanded: boolean("expanded").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const _attempts = pgTable("attempts", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => _tasks.id, { onDelete: "cascade" }),
  worktreePath: text("worktree_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
