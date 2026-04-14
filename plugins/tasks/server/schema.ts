import { type AnyPgColumn, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  parentId: text("parent_id").references((): AnyPgColumn => tasks.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const TaskSchema = createSelectSchema(tasks, {
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Task = z.infer<typeof TaskSchema>;

export const taskAttempts = pgTable("task_attempts", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const TaskAttemptSchema = createSelectSchema(taskAttempts, {
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type TaskAttempt = z.infer<typeof TaskAttemptSchema>;
