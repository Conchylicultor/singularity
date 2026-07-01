import { createTask, getTask, ensureMetaTask } from "@plugins/tasks/plugins/tasks-core/server";
import { reportInvestigationSink } from "@plugins/reports/server";

// The Reports meta-folder id. Kept as the exact historical string so the
// existing folder task's identity (and its reparent migration) is preserved.
export const REPORTS_META_TASK_ID = "task-meta-reports";

// Ensures the Reports meta-folder exists, then registers the task-creating
// handler into reports' investigation sink. reports emits into the sink on its
// investigate path; this bridge holds the `tasks` dependency, so a standalone
// composition that doesn't ship it simply leaves the sink unregistered (emit →
// undefined → investigateReport throws loudly). Idempotency lives here: a report
// already linked to a live (non-dropped) task reuses it.
export async function registerReportsInvestigation(): Promise<void> {
  await ensureMetaTask(REPORTS_META_TASK_ID, "Reports"); // before register: folder exists
  reportInvestigationSink.register(
    async ({ existingTaskId, title, description, author }) => {
      if (existingTaskId) {
        const linked = await getTask(existingTaskId);
        if (linked && linked.status !== "dropped") return { taskId: linked.id };
      }
      const task = await createTask({
        folderId: REPORTS_META_TASK_ID,
        title,
        description,
        author,
      });
      return { taskId: task.id };
    },
  );
}
