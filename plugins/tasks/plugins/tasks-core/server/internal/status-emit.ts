import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _tasks } from "./tables";
import { tasks } from "./views";
import type { TaskStatus } from "./schema";
import type { ConversationStatus } from "../../core/conversation-status";
import { taskStatusChanged, conversationStatusChanged } from "./tables-events";

// Status is computed from the `tasks_v` view (see schema.ts). There is no
// stored status column to compare against, so callers that mutate
// status-affecting state (drop/hold flags, attempts, conversations, pushes)
// snapshot the status before the write and pass it back to
// `emitStatusChangeIfChanged` after the write commits.

export async function readTaskStatus(taskId: string): Promise<TaskStatus | null> {
  const [row] = await db
    .select({ status: tasks.status })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return row?.status ?? null;
}

interface FolderSnapshot {
  folderId: string | null;
}

async function readFolder(taskId: string): Promise<FolderSnapshot | null> {
  const [row] = await db
    .select({ folderId: _tasks.folderId })
    .from(_tasks)
    .where(eq(_tasks.id, taskId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return row ?? null;
}

// If the task's computed status changed since `previous`, emit
// tasks.statusChanged. No-op when the task is gone (deleted) or status is
// unchanged. Run after the mutation commits so subscribers see the new state
// when they re-query.
export async function emitStatusChangeIfChanged(
  taskId: string,
  previous: TaskStatus | null,
): Promise<void> {
  const after = await readTaskStatus(taskId);
  if (after === null) return;
  if (previous !== null && previous === after) return;
  const folder = await readFolder(taskId);
  await taskStatusChanged.emit({
    taskId,
    folderId: folder?.folderId ?? null,
    status: after,
    // First-time reads (previous null) report previousStatus = current to
    // avoid lying about a non-existent transition; subscribers that care
    // about the difference can compare the two fields.
    previousStatus: previous ?? after,
  });
}

// Emit `conversation.statusChanged` when a single conversation's status column
// actually changes. Callers snapshot the prior status before the write and pass
// it here after the write commits (mirrors `emitStatusChangeIfChanged`). No-op
// when the status is unchanged.
export async function emitConversationStatusChange(
  conversationId: string,
  taskId: string | null,
  previousStatus: ConversationStatus | null,
  nextStatus: ConversationStatus,
): Promise<void> {
  if (previousStatus === nextStatus) return;
  await conversationStatusChanged.emit({
    conversationId,
    taskId,
    status: nextStatus,
    // First insert (previous null) reports previousStatus = current, matching
    // the task-status convention above.
    previousStatus: previousStatus ?? nextStatus,
  });
}
