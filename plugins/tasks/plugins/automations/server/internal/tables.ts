import { _tasks } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { taskOriginShape } from "../../core";

// Where a task came from: a row ⇔ an automation filed it (see the shape). The
// index serves the two reads keyed by automation: the open-task dedupe and one
// automation's history window.
export const tasksOrigin = defineExtension(_tasks, "origin", taskOriginShape, {
  indexes: (t, b) => [
    b.index("automation_filed").on(t.automationId, t.filedAt),
  ],
});
// Re-exported so drizzle-kit discovers the underlying pgTable.
export const _tasksOriginExt = tasksOrigin.table;
