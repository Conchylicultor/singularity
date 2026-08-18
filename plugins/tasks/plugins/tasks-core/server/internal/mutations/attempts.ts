import { db } from "@plugins/database/server";
import { _attempts } from "../tables";
import { attempts } from "../views";
import { eq } from "drizzle-orm";
import { withTaskStatusChange } from "../status-scope";

export async function deleteAttempt(id: string): Promise<void> {
  const [row] = await db
    .select({ taskId: _attempts.taskId })
    .from(_attempts)
    .where(eq(_attempts.id, id))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) return;
  await withTaskStatusChange(row.taskId, db, async () => {
    await db.delete(_attempts).where(eq(_attempts.id, id));
  });
}

export interface CreateAttemptInput {
  id: string;
  taskId: string;
  worktreePath: string;
}

export async function createAttempt(input: CreateAttemptInput) {
  // The new attempt may flip the parent task's computed status (e.g.
  // new → attempted → in_progress once a conversation lands). The actual
  // flip usually happens via insertConversation, but the write is bracketed
  // here too in case an attempt is created without one.
  await withTaskStatusChange(input.taskId, db, async () => {
    await db.insert(_attempts).values(input);
  });
  const [row] = await db
    .select()
    .from(attempts)
    .where(eq(attempts.id, input.id))
    .limit(1);
  return row!;
}
