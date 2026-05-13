import { db } from "@plugins/database/server";
import { _attempts, _conversations, _tasks } from "../tables";
import { conversations } from "../schema";
import { eq } from "drizzle-orm";
import { findNextRankUnder } from "../queries/tasks";
import { CONVERSATIONS_META_TASK_ID } from "./tasks";
import { tasksResource, attemptsResource, recentConversationsResource } from "../resources";
import path from "path";

export interface AdoptOrphanInput {
  id: string;
  worktreePath: string;
  runtimeId: string;
  status: "starting" | "working" | "waiting" | "gone" | "done";
  title?: string | null;
}

// Synthesises a task + attempt + conversation row in a single transaction for
// a live tmux session that has no corresponding DB rows. Called by the poller
// when it discovers an orphan session.
//
// `input.id` is forced to be the conversation id because the poller matches
// live tmux sessions to DB rows by id (the tmux session name is fixed once
// spawned). The attempt id is derived from the worktree basename so that
// `basename(attempt.worktreePath) === attempt.id` — the invariant the rest of
// the system relies on (e.g. the "Open app" button).
const TASK_PREFIX = "task";
const newTaskId = () =>
  `${TASK_PREFIX}-${Math.floor(Date.now() / 1000)}-${Math.random().toString(36).slice(2, 6)}`;

export async function adoptOrphanConversation(input: AdoptOrphanInput) {
  let inserted = false;
  const taskId = newTaskId();
  // Derive attempt id from the worktree directory name so basename(worktreePath) === attemptId.
  const attemptId = path.basename(input.worktreePath);

  // The attempt may already exist (e.g. the conversation was originally
  // created on a worktree server, so the attempt row is in the main DB
  // but the conversation row is not). If so, link the new conversation
  // to the existing attempt instead of creating a new task+attempt chain.
  const [existing] = await db
    .select({ id: _attempts.id, taskId: _attempts.taskId })
    .from(_attempts)
    .where(eq(_attempts.id, attemptId))
    .limit(1);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (existing) {
    const [row] = await db
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
  } else {
    await db.transaction(async (tx) => {
      const rank = await findNextRankUnder(CONVERSATIONS_META_TASK_ID, tx);
      await tx
        .insert(_tasks)
        .values({
          id: taskId,
          parentId: CONVERSATIONS_META_TASK_ID,
          title: input.title?.trim() || "Untitled",
          rank: rank.toJSON(),
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
  }
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
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  return row ?? null;
}
