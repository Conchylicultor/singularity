import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import {
  _attempts,
  _tasks,
  CONVERSATIONS_META_TASK_ID,
  attemptsResource,
  nextRankUnder,
  tasksResource,
} from "@plugins/tasks/server";
import { Runtime } from "../api";
import type { ConversationModel } from "../model";
import { _conversations } from "./tables";
import { conversations } from "./schema";
import type { Conversation } from "../../shared/types";
import { forkDatabase } from "./db-fork";
import { reportForkError } from "./fork-errors";
import {
  CONVERSATION_PREFIX,
  setupWorktree,
  worktreePathFor,
} from "@server/worktree";

const DEFAULT_RUNTIME = "tmux";
const DEFAULT_MODEL: ConversationModel = "opus";

function synthesiseTitle(prompt: string | undefined): string {
  const trimmed = (prompt ?? "").trim();
  if (!trimmed) return "Untitled";
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? trimmed;
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
}

export async function createConversation(
  opts: {
    runtimeId?: string;
    taskId?: string;
    attemptId?: string;
    prompt?: string;
    model?: ConversationModel;
    spawnedBy?: string;
  } = {},
): Promise<Conversation> {
  const runtimeId = opts.runtimeId ?? DEFAULT_RUNTIME;
  const runtime = Runtime.get(runtimeId);
  const model = opts.model ?? DEFAULT_MODEL;

  // Every conversation belongs to exactly one attempt. Synthesise task +
  // attempt when the caller hasn't provided one. The attempt id doubles as
  // the worktree dir name — `claude-<timestamp>` keeps gateway routing
  // seamless.
  let attemptId = opts.attemptId;
  let worktreePath: string;

  if (attemptId) {
    const [row] = await db
      .select({ worktreePath: _attempts.worktreePath })
      .from(_attempts)
      .where(eq(_attempts.id, attemptId))
      .limit(1);
    if (!row) throw new Error(`Unknown attemptId "${attemptId}"`);
    worktreePath = row.worktreePath;
  } else {
    let taskId = opts.taskId;
    if (!taskId) {
      const newTaskId = `task-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const rank = await nextRankUnder(CONVERSATIONS_META_TASK_ID);
      const [t] = await db
        .insert(_tasks)
        .values({
          id: newTaskId,
          parentId: CONVERSATIONS_META_TASK_ID,
          title: synthesiseTitle(opts.prompt),
          author: opts.spawnedBy ?? Bun.env.SINGULARITY_WORKTREE ?? "user",
          rank,
        })
        .returning();
      taskId = t!.id;
      tasksResource.notify();
    } else {
      // Seed the title from the first conversation so it stays stable after.
      const [seeded] = await db
        .update(_tasks)
        .set({ title: synthesiseTitle(opts.prompt), updatedAt: new Date() })
        .where(
          and(
            eq(_tasks.id, taskId),
            inArray(_tasks.title, ["Untitled", "Untitled conversation"]),
            sql`NOT EXISTS (SELECT 1 FROM ${_attempts} WHERE ${_attempts.taskId} = ${_tasks.id})`,
          ),
        )
        .returning({ id: _tasks.id });
      if (seeded) tasksResource.notify();
    }
    // Seconds-precision timestamp + random suffix: readable in URLs while
    // avoiding tmux session-name collisions when two conversations are
    // created in the same second.
    const suffix = Math.random().toString(36).slice(2, 6);
    attemptId = `${CONVERSATION_PREFIX}-${Math.floor(Date.now() / 1000)}-${suffix}`;
    const newAttemptId = attemptId;
    worktreePath = await worktreePathFor(newAttemptId);
    await setupWorktree(newAttemptId, worktreePath);
    // DB fork is only consumed when the worktree is later deployed via
    // `./singularity build`, so detach it to keep conversation creation snappy.
    // `./singularity build` verifies the DB exists before deploying.
    void forkDatabase(newAttemptId).catch((err) => {
      console.error(`[conversations] db fork failed for ${newAttemptId}`, err);
      reportForkError(newAttemptId, err);
    });
    await db
      .insert(_attempts)
      .values({ id: newAttemptId, taskId, worktreePath });
    // Cascade would eventually reach attempts via conversationsResource, but
    // notifying directly keeps the attempts feed correct even if a future
    // path inserts an attempt without an accompanying conversation.
    attemptsResource.notify();
  }

  // For the current 1:1 case, reuse the attempt id as the conversation id so
  // the gateway subdomain (<id>.localhost:9000) and tmux session name continue
  // to round-trip. A future multi-conversation-per-attempt model will pick a
  // separate conversation id here.
  const conversationId = attemptId;

  // Insert the DB row BEFORE the runtime spawns so the poller never observes
  // a live session without a matching DB row.
  // SINGULARITY_WORKTREE is guaranteed at server startup (db/client.ts throws
  // without it), so the env fallback always resolves to the current worktree
  // slug. A null here would leave spawned Claudes unable to dial back for MCP.
  const spawnedBy = opts.spawnedBy ?? Bun.env.SINGULARITY_WORKTREE;
  if (!spawnedBy) {
    throw new Error("createConversation requires spawnedBy (or SINGULARITY_WORKTREE)");
  }

  await db
    .insert(_conversations)
    .values({
      id: conversationId,
      attemptId,
      runtime: runtimeId,
      model,
      spawnedBy,
    });

  await runtime.create(conversationId, worktreePath, {
    prompt: opts.prompt,
    model,
    spawnedBy,
  });

  // Read back from the public view so the response matches ConversationSchema
  // exactly (includes taskId, worktreePath, active).
  const [row] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  return row as Conversation;
}

export async function deleteConversation(id: string): Promise<void> {
  const [row] = await db
    .select({ runtime: _conversations.runtime })
    .from(_conversations)
    .where(eq(_conversations.id, id));
  const runtimeId = row?.runtime ?? DEFAULT_RUNTIME;
  await Runtime.get(runtimeId).delete(id);
}
