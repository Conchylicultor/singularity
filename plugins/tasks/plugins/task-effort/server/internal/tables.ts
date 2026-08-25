import { _tasks } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { parsedText } from "@plugins/database/plugins/sql-column/server";
import { StoredEffortSchema } from "@plugins/conversations/plugins/effort-provider/core";

// Per-task thinking mode (effort). Stores the logical level id; the CLI delivery
// (--effort flag vs --settings ultracode) is resolved from the effort-provider
// registry at launch. The stored schema is the tolerant one, so a level id that
// has since been renamed normalizes here rather than reaching that lookup.
export const tasksEffort = defineExtension(_tasks, "effort", {
  level: parsedText("level", StoredEffortSchema).notNull(),
});
export const _tasksEffortExt = tasksEffort.table;
