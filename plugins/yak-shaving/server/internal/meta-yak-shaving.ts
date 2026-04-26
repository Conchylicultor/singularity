import { ensureMetaTask } from "@plugins/tasks-core/server";

// Meta task that owns conversations spawned by yak-shaving system jobs
// (classifier, rebuild, regen-next-action). Mirrors `AGENTS_META_TASK_ID`.
export const YAK_META_TASK_ID = "task-meta-yak-shaving";
const TITLE = "Yak shaving";

export async function ensureYakMetaTask(): Promise<void> {
  await ensureMetaTask(YAK_META_TASK_ID, TITLE);
}
