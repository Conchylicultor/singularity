import { ensureMetaTask } from "@plugins/tasks-core/server";

// Parent task for system conversations (kind = "system") — yak-shaving
// rebuilds and any future machine-plumbing jobs. Keeps their auto-created
// task rows out of the user-facing task tree under CONVERSATIONS_META_TASK_ID.
export const SYSTEM_META_TASK_ID = "task-meta-system";
const TITLE = "System";

export async function ensureSystemMeta(): Promise<void> {
  await ensureMetaTask(SYSTEM_META_TASK_ID, TITLE);
}
