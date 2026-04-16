import { eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { _attempts, _tasks } from "@plugins/tasks/server/schema_internal";
import { attemptsResource } from "@plugins/tasks/server/api";
import { Runtime } from "../api";
import type { ConversationModel } from "../model";
import { _conversations } from "../schema_internal";
import type { Conversation } from "../../shared/types";
import { forkDatabase } from "./db-fork";
import {
  CONVERSATION_PREFIX,
  setupWorktree,
  worktreePathFor,
} from "./worktree";

const DEFAULT_RUNTIME = "tmux";
const DEFAULT_MODEL: ConversationModel = "opus";

function synthesiseTitle(prompt: string | undefined): string {
  const trimmed = (prompt ?? "").trim();
  if (!trimmed) return "Untitled conversation";
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
      const [t] = await db
        .insert(_tasks)
        .values({ id: newTaskId, title: synthesiseTitle(opts.prompt) })
        .returning();
      taskId = t!.id;
    }
    attemptId = `${CONVERSATION_PREFIX}-${Math.floor(Date.now() / 1000)}`;
    worktreePath = await worktreePathFor(attemptId);
    await setupWorktree(attemptId, worktreePath);
    await forkDatabase(attemptId);
    await db
      .insert(_attempts)
      .values({ id: attemptId, taskId, worktreePath });
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
  const [row] = await db
    .insert(_conversations)
    .values({
      id: conversationId,
      attemptId,
      runtime: runtimeId,
      model,
    })
    .returning();

  await runtime.create(conversationId, worktreePath, {
    prompt: opts.prompt,
    model,
  });
  return { ...row!, worktreePath, active: row!.status !== "gone" } as Conversation;
}

export async function deleteConversation(id: string): Promise<void> {
  const [row] = await db
    .select({ runtime: _conversations.runtime })
    .from(_conversations)
    .where(eq(_conversations.id, id));
  const runtimeId = row?.runtime ?? DEFAULT_RUNTIME;
  await Runtime.get(runtimeId).delete(id);
}
