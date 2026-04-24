import { db } from "@server/db/client";
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
//
// `input.id` is forced to be the conversation id because the poller matches
// live tmux sessions to DB rows by id (the tmux session name is fixed once
// spawned). Task and attempt rows get fresh ids — there is no semantic reason
// for them to alias the conversation id, and the prior aliasing was the root
// of the "attempt id == conversation id" confusion.
const TASK_PREFIX = "task";
const ATTEMPT_PREFIX = "att";
const newId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export async function adoptOrphanConversation(input: AdoptOrphanInput) {
  let inserted = false;
  const taskId = newId(TASK_PREFIX);
  const attemptId = newId(ATTEMPT_PREFIX);
  await db.transaction(async (tx) => {
    const rank = await findNextRankUnder(CONVERSATIONS_META_TASK_ID, tx);
    await tx
      .insert(_tasks)
      .values({
        id: taskId,
        parentId: CONVERSATIONS_META_TASK_ID,
        title: input.title?.trim() || input.id,
        rank,
      });
    await tx
      .insert(_attempts)
      .values({ id: attemptId, taskId, worktreePath: input.worktreePath });
    const [row] = await tx
      .insert(_conversations)
      .values({
        id: input.id,
        attemptId,
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
