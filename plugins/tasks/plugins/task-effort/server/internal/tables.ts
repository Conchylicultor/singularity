import { _tasks } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { taskEffortShape } from "../../shared/schemas";

// Per-task thinking mode (effort). Stores the logical level id; the CLI delivery
// (--effort flag vs --settings ultracode) is resolved from the effort-provider
// registry at launch. The stored schema is the tolerant one, so a level id that
// has since been renamed normalizes here rather than reaching that lookup.
export const tasksEffort = defineExtension(_tasks, "effort", taskEffortShape);
export const _tasksEffortExt = tasksEffort.table;
