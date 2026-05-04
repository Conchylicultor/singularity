import { db } from "@server/db/client";
import { _attempts, _conversations } from "./tables";
import { eq, isNull } from "drizzle-orm";
import { attemptsResource } from "./resources";
import { emitStatusChangeIfChanged, readTaskStatus } from "./status-emit";

export async function sweepOrphanedAttempts(): Promise<void> {
  const orphaned = await db
    .select({ id: _attempts.id, taskId: _attempts.taskId })
    .from(_attempts)
    .leftJoin(_conversations, eq(_conversations.attemptId, _attempts.id))
    .where(isNull(_conversations.id));

  if (orphaned.length === 0) return;

  for (const attempt of orphaned) {
    const before = await readTaskStatus(attempt.taskId);
    await db.delete(_attempts).where(eq(_attempts.id, attempt.id));
    await emitStatusChangeIfChanged(attempt.taskId, before);
    // This is always a symptom of a prior crash or bug: an attempt was
    // inserted but createConversation never reached insertConversation.
    console.error(
      `[tasks-core] BUG: swept orphaned attempt ${attempt.id} (task ${attempt.taskId}) — ` +
        `createConversation crashed after createAttempt but before insertConversation`,
    );
  }
  attemptsResource.notify();
}
