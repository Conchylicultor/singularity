import { _tasks } from "@plugins/tasks/plugins/tasks-core/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { taskOriginShape } from "../../core";

// Where a task came from: a row ⇔ an automation filed or launched it (see the
// shape). The index serves the reads keyed by automation: the open-task dedupe,
// the occupied-slot count and one automation's history window. `role` defaults
// to `filed` in the DB, so every row written before launches existed reads as
// the filing it was.
export const tasksOrigin = defineExtension(_tasks, "origin", taskOriginShape, {
  columns: { role: { default: "filed" } },
  indexes: (t, b) => [
    b.index("automation_filed").on(t.automationId, t.filedAt),
  ],
});
// Re-exported so drizzle-kit discovers the underlying pgTable.
export const _tasksOriginExt = tasksOrigin.table;
