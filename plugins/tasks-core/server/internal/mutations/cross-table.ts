import { db } from "../../../../../server/src/db/client";
import { _attempts, _conversations, _tasks } from "../tables";
import { conversations } from "../schema";
import { eq } from "drizzle-orm";
import { findNextRankUnder } from "../queries/tasks";
import { CONVERSATIONS_META_TASK_ID } from "./tasks";
import { tasksResource, attemptsResource, recentConversationsResource } from "../resources";

export interface AdoptOrphanInput {
  id: string;
  worktreePath: string;
  runtimeId: string;
  status: "starting" | "working" | "waiting" | "gone";
  title?: string | null;
}

// Synthesises a task + attempt + conversation row in a single transaction for
// a live tmux session that has no corresponding DB rows. Called by the poller
// when it discovers an orphan session.
export async function adoptOrphanConversation(input: AdoptOrphanInput) {
  let inserted = false;
  await db.transaction(async (tx) => {
    const rank = await findNextRankUnder(CONVERSATIONS_META_TASK_ID, tx);
    await tx
      .insert(_tasks)
      .values({
        id: input.id,
        parentId: CONVERSATIONS_META_TASK_ID,
        title: input.title?.trim() || input.id,
        rank,
      })
      .onConflictDoNothing();
    await tx
      .insert(_attempts)
      .values({ id: input.id, taskId: input.id, worktreePath: input.worktreePath })
      .onConflictDoNothing();
    const [row] = await tx
      .insert(_conversations)
      .values({
        id: input.id,
        attemptId: input.id,
        runtime: input.runtimeId,
        status: input.status,
        title: input.title ?? null,
        spawnedBy: "poller",
        model: "opus",
      })
      .onConflictDoNothing()
      .returning();
    inserted = !!row;
  });
  if (inserted) {
    tasksResource.notify();
    attemptsResource.notify();
    recentConversationsResource.notify();
  }
  if (!inserted) return null;
  const [row] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, input.id))
    .limit(1);
  return row ?? null;
}
