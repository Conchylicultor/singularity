import {
  CONVERSATIONS_META_TASK_ID,
  ensureMetaTask,
  backfillMetaParent,
} from "@plugins/tasks-core/server";

const TITLE = "Conversations";

export async function ensureConversationsMetaTask(): Promise<boolean> {
  return ensureMetaTask(CONVERSATIONS_META_TASK_ID, TITLE);
}

export async function backfillConversationsMetaParent(): Promise<number> {
  return backfillMetaParent(CONVERSATIONS_META_TASK_ID);
}
