import {
  CONVERSATIONS_META_TASK_ID,
  createTask,
  updateTaskTitle,
  createAttempt,
  getAttempt,
  insertConversation,
  getConversation,
  getConversationRuntime,
} from "@plugins/tasks-core/server";
import { Runtime } from "./runtime";
import type { ConversationModel } from "../schema";
import type { Conversation, ConversationKind } from "../../shared";
import { forkDatabase } from "./db-fork";
import { reportForkError } from "./fork-errors";
import { setupWorktree, worktreePathFor } from "@server/worktree";
import { conversationCreated } from "./tables-created-event";

const DEFAULT_RUNTIME = "tmux";
const DEFAULT_MODEL: ConversationModel = "opus";

// Three independent id namespaces, each self-describing in logs and URLs.
// Legacy rows may still carry the pre-rename `claude-…` prefix; matchers that
// surface live sessions accept both.
const ATTEMPT_PREFIX = "att";
const CONVERSATION_PREFIX = "conv";
const newId = (prefix: string) => {
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${Math.floor(Date.now() / 1000)}-${suffix}`;
};

function synthesiseTitle(prompt: string | undefined): string {
  const trimmed = (prompt ?? "").trim();
  if (!trimmed) return "Untitled";
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? trimmed;
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
}

const UNINFORMATIVE_TITLES = ["Untitled", "Untitled conversation"];

export async function createConversation(
  opts: {
    runtimeId?: string;
    taskId?: string;
    attemptId?: string;
    prompt?: string;
    model?: ConversationModel;
    spawnedBy?: string;
    kind?: ConversationKind;
    forkFromConversationId?: string;
  } = {},
): Promise<Conversation> {
  const runtimeId = opts.runtimeId ?? DEFAULT_RUNTIME;
  const runtime = Runtime.get(runtimeId);

  // When forking, inherit the source's attempt (same worktree) and claude
  // session id; let the caller still override `model` so the +Sonnet/+Opus
  // buttons work as expected.
  let resumeSessionId: string | undefined;
  let attemptId = opts.attemptId;
  let inheritedModel: ConversationModel | undefined;
  if (opts.forkFromConversationId) {
    const source = await getConversation(opts.forkFromConversationId);
    if (!source) {
      throw new Error(`Source conversation ${opts.forkFromConversationId} not found`);
    }
    if (!source.claudeSessionId) {
      throw new Error(
        `Source conversation ${opts.forkFromConversationId} hasn't started yet — no Claude session id available to fork`,
      );
    }
    if (attemptId && attemptId !== source.attemptId) {
      throw new Error(
        `forkFromConversationId requires attemptId to match the source attempt`,
      );
    }
    attemptId = source.attemptId;
    resumeSessionId = source.claudeSessionId;
    inheritedModel = source.model;
  }
  const model = opts.model ?? inheritedModel ?? DEFAULT_MODEL;

  let worktreePath: string;
  let conversationId: string;

  if (attemptId) {
    const attempt = await getAttempt(attemptId);
    if (!attempt) throw new Error(`Unknown attemptId "${attemptId}"`);
    worktreePath = attempt.worktreePath;
    conversationId = newId(CONVERSATION_PREFIX);
  } else {
    let taskId = opts.taskId;
    if (!taskId) {
      const task = await createTask({
        parentId: CONVERSATIONS_META_TASK_ID,
        title: synthesiseTitle(opts.prompt),
        author: opts.spawnedBy ?? Bun.env.SINGULARITY_WORKTREE ?? "user",
      });
      taskId = task.id;
    } else {
      await updateTaskTitle(taskId, synthesiseTitle(opts.prompt), UNINFORMATIVE_TITLES);
    }

    attemptId = newId(ATTEMPT_PREFIX);
    const newAttemptId = attemptId;
    worktreePath = await worktreePathFor(newAttemptId);
    await setupWorktree(newAttemptId, worktreePath);
    void forkDatabase(newAttemptId).catch((err) => {
      console.error(`[conversations] db fork failed for ${newAttemptId}`, err);
      reportForkError(newAttemptId, err);
    });
    await createAttempt({ id: newAttemptId, taskId, worktreePath });
    conversationId = newId(CONVERSATION_PREFIX);
  }

  const spawnedBy = opts.spawnedBy ?? Bun.env.SINGULARITY_WORKTREE;
  if (!spawnedBy) {
    throw new Error("createConversation requires spawnedBy (or SINGULARITY_WORKTREE)");
  }

  await insertConversation({
    id: conversationId,
    attemptId,
    runtime: runtimeId,
    model,
    spawnedBy,
    kind: opts.kind ?? "user",
  });

  await runtime.create(conversationId, worktreePath, {
    prompt: opts.prompt,
    model,
    spawnedBy,
    resumeSessionId,
    forkSession: !!opts.forkFromConversationId,
  });

  const row = await getConversation(conversationId);
  const conv = row as Conversation;

  await conversationCreated.emit({
    conversationId: conv.id,
    taskId: conv.taskId,
    model: conv.model,
    spawnedBy: conv.spawnedBy!,
    createdAt: conv.createdAt.toISOString(),
  });

  return conv;
}

export async function deleteConversation(id: string): Promise<void> {
  const row = await getConversationRuntime(id);
  const runtimeId = row?.runtime ?? DEFAULT_RUNTIME;
  await Runtime.get(runtimeId).delete(id);
}

export async function resumeConversation(id: string): Promise<Conversation> {
  const row = await getConversation(id);
  if (!row) throw new Error(`Conversation ${id} not found`);
  if (row.status !== "gone") {
    throw new Error(`Conversation ${id} is not gone (status: ${row.status})`);
  }
  if (!row.claudeSessionId) {
    throw new Error(`Conversation ${id} has no saved Claude session to resume`);
  }
  if (!row.spawnedBy) {
    throw new Error(`Conversation ${id} has no spawnedBy recorded`);
  }

  const runtime = Runtime.get(row.runtime);
  // tmux refuses `new-session -s <name>` when a (dead) session by that name
  // still exists. Clear any stale pane before re-spawning.
  await runtime.delete(id);

  await runtime.create(id, row.worktreePath, {
    resumeSessionId: row.claudeSessionId,
    model: row.model,
    spawnedBy: row.spawnedBy,
  });

  return (await getConversation(id)) as Conversation;
}
