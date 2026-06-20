import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _attempts, pushes } from "../tables";
import { pushLanded } from "../tables-events";
import { emitStatusChangeIfChanged, readTaskStatus } from "../status-emit";

export interface InsertPushInput {
  id: string;
  attemptId: string;
  conversationId: string;
  sha: string;
  pushId: string;
  message: string;
  createdAt: Date;
}

// Returns true if the row was inserted (false = already existed).
export async function insertPush(input: InsertPushInput): Promise<boolean> {
  // Resolve the owning task before the write so we can detect a status flip
  // (e.g. attempt → done) once the push lands and the conversation closes.
  const [attemptRow] = await db
    .select({ taskId: _attempts.taskId })
    .from(_attempts)
    .where(eq(_attempts.id, input.attemptId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  const taskId = attemptRow?.taskId ?? null;
  const before = taskId ? await readTaskStatus(taskId) : null;
  const [row] = await db
    .insert(pushes)
    .values(input)
    .onConflictDoNothing()
    .returning();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (row) {
    // Emit after the INSERT has committed (auto-commit: no tx wraps this call).
    // See docs/events.md §"Transactional boundary on emit()".
    await pushLanded.emit({
      pushId: input.pushId,
      sha: input.sha,
      attemptId: input.attemptId,
      conversationId: input.conversationId,
    });
    if (taskId) await emitStatusChangeIfChanged(taskId, before);
  }
  return !!row;
}
