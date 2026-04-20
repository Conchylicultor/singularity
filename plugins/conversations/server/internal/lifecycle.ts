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
import { Runtime } from "../api";
import type { ConversationModel } from "../model";
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

const UNINFORMATIVE_TITLES = ["Untitled", "Untitled conversation"];

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

  let attemptId = opts.attemptId;
  let worktreePath: string;

  if (attemptId) {
    const attempt = await getAttempt(attemptId);
    if (!attempt) throw new Error(`Unknown attemptId "${attemptId}"`);
    worktreePath = attempt.worktreePath;
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

    const suffix = Math.random().toString(36).slice(2, 6);
    attemptId = `${CONVERSATION_PREFIX}-${Math.floor(Date.now() / 1000)}-${suffix}`;
    const newAttemptId = attemptId;
    worktreePath = await worktreePathFor(newAttemptId);
    await setupWorktree(newAttemptId, worktreePath);
    void forkDatabase(newAttemptId).catch((err) => {
      console.error(`[conversations] db fork failed for ${newAttemptId}`, err);
      reportForkError(newAttemptId, err);
    });
    await createAttempt({ id: newAttemptId, taskId, worktreePath });
  }

  const conversationId = attemptId;

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
  });

  await runtime.create(conversationId, worktreePath, {
    prompt: opts.prompt,
    model,
    spawnedBy,
  });

  const row = await getConversation(conversationId);
  return row as Conversation;
}

export async function deleteConversation(id: string): Promise<void> {
  const row = await getConversationRuntime(id);
  const runtimeId = row?.runtime ?? DEFAULT_RUNTIME;
  await Runtime.get(runtimeId).delete(id);
}
