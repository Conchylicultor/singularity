import { ensureMetaTask } from "@plugins/tasks-core/server";

export const AGENTS_META_TASK_ID = "task-meta-agents";
const TITLE = "Agents";

export async function ensureAgentsMetaTask(): Promise<void> {
  await ensureMetaTask(AGENTS_META_TASK_ID, TITLE);
}
