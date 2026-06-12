import { ensureMetaTask } from "@plugins/tasks/plugins/tasks-core/server";

export const CRASHES_META_TASK_ID = "task-meta-crashes";
const TITLE = "Crashes";

export async function ensureCrashesMetaTask(): Promise<void> {
  await ensureMetaTask(CRASHES_META_TASK_ID, TITLE);
}
