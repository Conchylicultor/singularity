import { ensureMetaTask } from "@plugins/tasks-core/server";
import { IMPROVEMENTS_META_TASK_ID } from "@plugins/improve/shared/constants";

const TITLE = "Improvements";

export async function ensureImprovementsMetaTask(): Promise<void> {
  await ensureMetaTask(IMPROVEMENTS_META_TASK_ID, TITLE);
}
