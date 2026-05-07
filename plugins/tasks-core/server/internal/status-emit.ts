import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _tasks } from "./tables";
import { tasks } from "./schema";
import type { TaskStatus } from "./schema";
import { taskStatusChanged } from "./tables-events";

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
  return row?.status ?? null;
}

interface ParentSnapshot {
  parentId: string | null;
}

async function readParent(taskId: string): Promise<ParentSnapshot | null> {
  const [row] = await db
    .select({ parentId: _tasks.parentId })
    .from(_tasks)
    .where(eq(_tasks.id, taskId))
    .limit(1);
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
  const parent = await readParent(taskId);
  await taskStatusChanged.emit({
    taskId,
    parentId: parent?.parentId ?? null,
    status: after,
    // First-time reads (previous null) report previousStatus = current to
    // avoid lying about a non-existent transition; subscribers that care
    // about the difference can compare the two fields.
    previousStatus: previous ?? after,
  });
}
