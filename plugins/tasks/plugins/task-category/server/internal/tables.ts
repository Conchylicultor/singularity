import { text } from "drizzle-orm/pg-core";
import { _tasks } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

// Per-task category: the contributed registry id (see ./contribution). Presence
// = categorized; system-set only — there is no user picker.
export const tasksCategory = defineExtension(_tasks, "category", {
  category: text("category").notNull(),
});
// Re-exported so drizzle-kit discovers the underlying pgTable.
export const _tasksCategoryExt = tasksCategory.table;
