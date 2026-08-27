import { db } from "@plugins/database/server";
import { DEFAULT_MODEL } from "@plugins/conversations/plugins/model-provider/core";
import { _attempts, _tasks } from "../tables";
import { conversations } from "../views";
import type { Conversation } from "../schema";
import { eq } from "drizzle-orm";
import { findNextRankInFolder } from "../queries/tasks";
import { listActiveConversations } from "../queries/conversations";
import { insertConversationRow } from "./conversations";
import { updateTask } from "./tasks";
import {
  ensureMainWorktreeRoot,
  isCanonicalWorktreePath,
} from "@plugins/infra/plugins/worktree/server";
import path from "path";

// ONE HALF of the exit-drop policy, and named for exactly the half it is: does
// any sibling conversation on this task remain active? If one does, another
// conversation may still land the work, so this closing one must not drop the
// task. The closing conversation is excluded by id, so callers may invoke this
// either before or after marking it closed.
//
// The other half — "does this attempt have work at stake?" — deliberately does
// NOT live here. It used to: this function read `listPushesForAttempt` and
// treated an empty result as proof that nothing was pushed, which was false
// whenever the ledger's background ingest lagged (observed 40+ minutes behind a
// wedged queue) and is still false for an attempt whose commits are not pushed
// yet. An agent that pushed and then exited cleanly got its task dropped. That fact is now git-measured by `tasks/attempt-work`, and the whole
// policy lives in the plugin named for it, `conversation-view/drop-and-exit`,
// as `dropTaskOnExit` — the only thing callers should reach for. tasks-core has
// no business guessing at an attempt's standing, and an honest name here cannot
// be mistaken for the whole policy.
// Design: research/2026-08-17-global-attempt-work-git-derived-standing.md.
//
// Returns whether the task was dropped.
export async function dropTaskIfNoActiveSibling(
  conversation: Conversation,
): Promise<boolean> {
  const activeConversations = await listActiveConversations();
  const hasOtherActive = activeConversations.some(
    (c) => c.taskId === conversation.taskId && c.id !== conversation.id,
  );

  if (hasOtherActive) return false;
  await updateTask(conversation.taskId, { drop: true });
  return true;
}

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

// Returns the adopted conversation row plus the id of the task this call
// synthesized (null when the conversation was linked to an existing attempt's
// task) — the caller stamps the new task's category, which lives in a plugin
// tasks-core cannot import.
export async function adoptOrphanConversation(input: AdoptOrphanInput) {
  // Never adopt a tmux session whose worktree is not a canonical agent worktree
  // (`<root>/.claude/worktrees/<id>`). Stray sessions started in /tmp or the
  // repo root are not Singularity attempts; adopting them would synthesize a
  // phantom attempt row with a non-canonical worktree_path that the
  // worktree-cleanup reaper can never act on. Returning null = not adopted; the
  // poller treats this exactly like any other un-adopted orphan and moves on.
  const repoRoot = await ensureMainWorktreeRoot();
  if (!isCanonicalWorktreePath(input.worktreePath, repoRoot)) return null;

  let inserted = false;
  let createdTaskId: string | null = null;
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

  if (existing) {
    const row = await insertConversationRow(
      db,
      {
        id: input.id,
        attemptId,
        runtime: input.runtimeId,
        status: input.status,
        title: input.title ?? null,
        spawnedBy: "poller",
        model: DEFAULT_MODEL,
      },
      { ignoreConflict: true },
    );
    inserted = !!row;
  } else {
    await db.transaction(async (tx) => {
      const rank = await findNextRankInFolder(null, tx);
      await tx.insert(_tasks).values({
        id: taskId,
        title: input.title?.trim() || "Untitled",
        rank: rank.toJSON(),
      });
      await tx
        .insert(_attempts)
        .values({ id: attemptId, taskId, worktreePath: input.worktreePath });
      const row = await insertConversationRow(
        tx,
        {
          id: input.id,
          attemptId,
          runtime: input.runtimeId,
          status: input.status,
          title: input.title ?? null,
          spawnedBy: "poller",
          model: DEFAULT_MODEL,
        },
        { ignoreConflict: true },
      );
      inserted = !!row;
      if (inserted) createdTaskId = taskId;
    });
  }
  if (!inserted) return null;
  const [row] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, input.id))
    .limit(1);
  if (!row) return null;
  return { conversation: row, createdTaskId };
}
