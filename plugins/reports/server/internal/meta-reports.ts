import { ensureMetaTask } from "@plugins/tasks/plugins/tasks-core/server";

export const REPORTS_META_TASK_ID = "task-meta-reports";
const TITLE = "Reports";

export async function ensureReportsMetaTask(): Promise<void> {
  await ensureMetaTask(REPORTS_META_TASK_ID, TITLE);
}
