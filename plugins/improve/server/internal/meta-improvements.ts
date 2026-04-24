import { ensureMetaTask } from "@plugins/tasks-core/server";

export const IMPROVEMENTS_META_TASK_ID = "task-meta-improvements";
const TITLE = "Improvements";

export async function ensureImprovementsMetaTask(): Promise<void> {
  await ensureMetaTask(IMPROVEMENTS_META_TASK_ID, TITLE);
}
