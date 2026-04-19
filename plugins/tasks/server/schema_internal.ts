import {
  type AnyPgColumn,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { rankText } from "../../../server/src/db/types";

// Physical tables that back a `pgView`. In-plugin writers import from here.
// Cross-plugin callers must never import this file — they use `./schema`
// (views + types). Plain tables with no derived view (e.g. `pushes`) live
// in `./schema` directly instead.

export const _tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id").references((): AnyPgColumn => _tasks.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    description: text("description"),
    // "user" for UI-created tasks, a conversation id for agent-created ones.
    author: text("author"),
    droppedAt: timestamp("dropped_at", { withTimezone: true }),
    heldAt: timestamp("held_at", { withTimezone: true }),
    expanded: boolean("expanded").notNull().default(false),
    rank: rankText("rank").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("tasks_parent_rank_idx").on(t.parentId, t.rank)],
);

export const _attempts = pgTable("attempts", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => _tasks.id, { onDelete: "cascade" }),
  worktreePath: text("worktree_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
