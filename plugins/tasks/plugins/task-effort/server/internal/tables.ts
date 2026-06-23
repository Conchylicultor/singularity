import { text } from "drizzle-orm/pg-core";
import { _tasks } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import type { EffortLevel } from "@plugins/conversations/plugins/effort-provider/core";

// Per-task thinking mode (effort). Stores the logical level id; the CLI delivery
// (--effort flag vs --settings ultracode) is resolved from the effort-provider
// registry at launch.
export const tasksEffort = defineExtension(_tasks, "effort", {
  level: text("level").$type<EffortLevel>().notNull(),
});
export const _tasksEffortExt = tasksEffort.table;
