import { db } from "@server/db/client";
import { pushes } from "../tables";
import { pushLanded } from "../tables-events";
import { pushesResource, attemptsResource } from "../resources";

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
  const [row] = await db
    .insert(pushes)
    .values(input)
    .onConflictDoNothing()
    .returning();
  if (row) {
    pushesResource.notify();
    attemptsResource.notify();
    // Emit after the INSERT has committed (auto-commit: no tx wraps this call).
    // See docs/events.md §"Transactional boundary on emit()".
    await pushLanded.emit({
      pushId: input.pushId,
      sha: input.sha,
      attemptId: input.attemptId,
      conversationId: input.conversationId,
    });
  }
  return !!row;
}
