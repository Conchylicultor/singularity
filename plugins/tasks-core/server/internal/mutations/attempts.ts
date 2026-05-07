import { db } from "@plugins/database/server";
import { _attempts } from "../tables";
import { attempts } from "../schema";
import { attemptsResource } from "../resources";
import { eq } from "drizzle-orm";
import { emitStatusChangeIfChanged, readTaskStatus } from "../status-emit";

export async function deleteAttempt(id: string): Promise<void> {
  const [row] = await db
    .select({ taskId: _attempts.taskId })
    .from(_attempts)
    .where(eq(_attempts.id, id))
    .limit(1);
  if (!row) return;
  const before = await readTaskStatus(row.taskId);
  await db.delete(_attempts).where(eq(_attempts.id, id));
  attemptsResource.notify();
  await emitStatusChangeIfChanged(row.taskId, before);
}

export interface CreateAttemptInput {
  id: string;
  taskId: string;
  worktreePath: string;
}

export async function createAttempt(input: CreateAttemptInput) {
  // The new attempt may flip the parent task's computed status (e.g.
  // new → attempted → in_progress once a conversation lands). The actual
  // flip usually happens via insertConversation, but we still snapshot
  // here for completeness in case an attempt is created without one.
  const before = await readTaskStatus(input.taskId);
  await db.insert(_attempts).values(input);
  attemptsResource.notify();
  const [row] = await db
    .select()
    .from(attempts)
    .where(eq(attempts.id, input.id))
    .limit(1);
  await emitStatusChangeIfChanged(input.taskId, before);
  return row!;
}
