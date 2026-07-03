import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import type { EmitTx } from "@plugins/infra/plugins/events/server";
import { _tasks } from "./tables";
import { tasks } from "./views";
import type { TaskStatus } from "./schema";
import type { ConversationStatus } from "../../core/conversation-status";
import { taskStatusChanged, conversationStatusChanged } from "./tables-events";
import { currentStatusBatch, type DbExecutor, type StatusBatch } from "./status-batch";

// Status is computed from the `tasks_v` view (see schema.ts). There is no
// stored status column to compare against, so callers that mutate
// status-affecting state (drop/hold flags, attempts, conversations, pushes)
// snapshot the status before the write and pass it back to
// `emitStatusChangeIfChanged` after the write commits.

export async function readTaskStatus(
  taskId: string,
  exec: DbExecutor = db,
): Promise<TaskStatus | null> {
  const [row] = await exec
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

async function readFolder(
  taskId: string,
  exec: DbExecutor = db,
): Promise<FolderSnapshot | null> {
  const [row] = await exec
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
//
// When a `withTaskStatusBatch` is active, this only RECORDS the task's entry
// status (earliest wins ⇒ = status at batch entry) and suppresses the per-edge
// emit; `flushStatusBatch` emits one net trigger per task on commit. `exec`
// lets non-batch callers read/emit on their own transaction handle so reads see
// uncommitted writes and the trigger enqueue lives or dies with them.
export async function emitStatusChangeIfChanged(
  taskId: string,
  previous: TaskStatus | null,
  exec: DbExecutor = db,
): Promise<void> {
  const batch = currentStatusBatch();
  if (batch) {
    if (!batch.before.has(taskId)) batch.before.set(taskId, previous);
    return;
  }
  const after = await readTaskStatus(taskId, exec);
  if (after === null) return;
  if (previous !== null && previous === after) return;
  const folder = await readFolder(taskId, exec);
  await taskStatusChanged.emit(
    {
      taskId,
      folderId: folder?.folderId ?? null,
      status: after,
      // First-time reads (previous null) report previousStatus = current to
      // avoid lying about a non-existent transition; subscribers that care
      // about the difference can compare the two fields.
      previousStatus: previous ?? after,
    },
    // On a transaction handle, emit on the same connection so the trigger
    // SELECT + emission audit + job INSERT commit atomically with the write.
    // `exec` is a PgTransaction here (structurally an EmitTx / NodePgDatabase);
    // this `{ tx }` path has no other caller, so the narrow cast reconciles the
    // PgTransaction ⇄ EmitTx nominal mismatch that eventsDispatchJob.enqueue
    // accepts at runtime.
    exec === db ? undefined : { tx: exec as EmitTx },
  );
}

// Emit the NET tasks.statusChanged per recorded task at batch commit: read the
// current status on the tx (sees all uncommitted edge writes), skip if the task
// is gone or its status is unchanged from batch entry, else emit one trigger on
// the tx so it commits atomically with the writes.
export async function flushStatusBatch(batch: StatusBatch): Promise<void> {
  for (const [taskId, before] of batch.before) {
    const after = await readTaskStatus(taskId, batch.tx);
    if (after === null) continue;
    if (before === after) continue;
    const folder = await readFolder(taskId, batch.tx);
    await taskStatusChanged.emit(
      {
        taskId,
        folderId: folder?.folderId ?? null,
        status: after,
        previousStatus: before ?? after,
      },
      // See emitStatusChangeIfChanged: narrow PgTransaction ⇄ EmitTx cast.
      { tx: batch.tx as EmitTx },
    );
  }
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
