import { db } from "@server/db/client";
import { _attempts } from "../tables";
import { attempts } from "../schema";
import { attemptsResource } from "../resources";
import { eq } from "drizzle-orm";
import { emitStatusChangeIfChanged, readTaskStatus } from "../status-emit";

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
