import {
  CONVERSATIONS_META_TASK_ID,
  createTask,
  createAttempt,
  deleteAttempt,
  getAttempt,
  insertConversation,
  getConversation,
  getConversationRuntime,
  updateConversation,
  updateTask,
  setConversationHibernated,
} from "@plugins/tasks/plugins/tasks-core/server";
import { Runtime } from "./runtime";
import { DEFAULT_MODEL, normalizeModel, type ConversationModel } from "@plugins/conversations/plugins/model-provider/core";
import type { Conversation, ConversationKind } from "@plugins/tasks/plugins/tasks-core/core";
import { databaseForkJob } from "@plugins/database/plugins/fork/server";
import { forkConfig } from "@plugins/config_v2/server";
import { setupWorktree, worktreePathFor } from "@plugins/infra/plugins/worktree/server";
import { conversationCreated } from "./tables-created-event";
import { SYSTEM_META_TASK_ID } from "./meta-system";
import { resolveAttachmentRefs } from "./resolve-prompt-attachments";
import { resolvePreprompt } from "@plugins/conversations/plugins/preprompts/server";
import { getTaskPreprompt } from "@plugins/tasks/plugins/task-preprompt/server";
import { wrapPreprompt } from "@plugins/conversations/plugins/transcript-watcher/core";

const DEFAULT_RUNTIME = "tmux";

// Three independent id namespaces, each self-describing in logs and URLs.
// Legacy rows may still carry the pre-rename `claude-…` prefix; matchers that
// surface live sessions accept both.
const ATTEMPT_PREFIX = "att";
const CONVERSATION_PREFIX = "conv";
const newId = (prefix: string) => {
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${Math.floor(Date.now() / 1000)}-${suffix}`;
};

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
    prepromptId?: string;
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
    inheritedModel = normalizeModel(source.model);
  }
  // Normalize on write too: callers like the auto-start job pass a model read
  // straight from a side-table that may still hold a legacy ("opus") value
  // queued before model flattening. Keep persisted rows on concrete ids.
  const model = normalizeModel(opts.model ?? inheritedModel ?? DEFAULT_MODEL);

  const spawnedBy = opts.spawnedBy ?? Bun.env.SINGULARITY_WORKTREE;
  if (!spawnedBy) {
    throw new Error("createConversation requires spawnedBy (or SINGULARITY_WORKTREE)");
  }

  let worktreePath: string;
  let conversationId: string;
  let newAttemptId: string | undefined;
  // The task this conversation belongs to, used to resolve a per-task preprompt
  // (baked into the first user turn as a <special_instructions> block). Derived
  // from the existing attempt when reusing a worktree, otherwise the task we
  // launch under.
  let effectiveTaskId: string | undefined;

  if (attemptId) {
    const attempt = await getAttempt(attemptId);
    if (!attempt) throw new Error(`Unknown attemptId "${attemptId}"`);
    worktreePath = attempt.worktreePath;
    effectiveTaskId = attempt.taskId;
    conversationId = newId(CONVERSATION_PREFIX);
  } else {
    let taskId = opts.taskId;
    if (!taskId) {
      const folderId =
        opts.kind === "system" ? SYSTEM_META_TASK_ID : CONVERSATIONS_META_TASK_ID;
      const task = await createTask({
        folderId,
        title: "Untitled",
        author: spawnedBy,
      });
      taskId = task.id;
    }
    effectiveTaskId = taskId;

    newAttemptId = newId(ATTEMPT_PREFIX);
    const thisAttemptId = newAttemptId;
    attemptId = thisAttemptId;
    worktreePath = await worktreePathFor(thisAttemptId);
    await setupWorktree(thisAttemptId, worktreePath);
    void forkConfig(thisAttemptId);
    await createAttempt({ id: thisAttemptId, taskId, worktreePath });
    // Durable fork via a graphile job: the enqueue is a committed row, so an
    // interrupted fork (e.g. backend restart mid-fork) is re-run when the
    // worker reboots instead of bricking the worktree. Enqueued after
    // createAttempt so the attempt row exists before the job can run. Failures
    // surface via the job's deduped fork-error notification and /api/jobs.
    await databaseForkJob.enqueue({ source: "singularity", target: thisAttemptId });
    conversationId = newId(CONVERSATION_PREFIX);
  }

  // Single chokepoint for `![](/api/attachments/<id>)` → `@<disk-path>` rewriting
  // so every entry point (HTTP create, agent launch, auto-start) gets it.
  // Wrapped in try/catch: if anything throws before insertConversation, the newly
  // created attempt has no conversation and must be cleaned up — otherwise the task
  // shows in_progress forever. The error is re-thrown so the caller still sees it.
  let resolvedPrompt: string | undefined;
  try {
    resolvedPrompt = opts.prompt
      ? (await resolveAttachmentRefs(opts.prompt)).text
      : undefined;

    await insertConversation({
      id: conversationId,
      attemptId,
      runtime: runtimeId,
      model,
      spawnedBy,
      kind: opts.kind ?? "user",
    });
  } catch (err) {
    if (newAttemptId) {
      // eslint-disable-next-line promise-safety/no-bare-catch
      await deleteAttempt(newAttemptId).catch((e) => {
        console.error(`[conversations] failed to delete orphaned attempt ${newAttemptId} during cleanup`, e);
      });
    }
    throw err;
  }

  // Resolve the preprompt (config list-item id → text). An explicit
  // opts.prepromptId (ad-hoc launch input) takes precedence over the task
  // default. A dangling or empty selection resolves to undefined → nothing is
  // injected.
  const prepromptId =
    opts.prepromptId ??
    (effectiveTaskId ? (await getTaskPreprompt(effectiveTaskId))?.prepromptId : undefined);
  const preprompt = resolvePreprompt(prepromptId);

  // Bake the preprompt into the FIRST user turn (wrapped in
  // <special_instructions>) so it's durable, visible in the transcript, and
  // replayed verbatim on resume/fork. Only on a fresh launch: a
  // forked/resumed transcript already contains the baked first turn, so
  // re-injecting (`claude --resume --fork-session` copies the original) would
  // duplicate it. The no-initial-prompt edge yields a first turn that is the
  // preprompt block alone.
  if (preprompt && !resumeSessionId) {
    resolvedPrompt = resolvedPrompt
      ? `${wrapPreprompt(preprompt)}\n\n${resolvedPrompt}`
      : wrapPreprompt(preprompt);
  }

  try {
    await runtime.create(conversationId, worktreePath, {
      prompt: resolvedPrompt,
      model,
      resumeSessionId,
      forkSession: !!opts.forkFromConversationId,
    });
  } catch (err) {
    // Without this, the row stays at "starting" forever — the poller skips
    // starting rows, and the UI just shows "Starting…" with a terminal pane
    // that prints "can't find session" because tmux never created one.
    // eslint-disable-next-line promise-safety/no-bare-catch
    await updateConversation(conversationId, {
      status: "gone",
      endedAt: new Date(),
    }).catch((e) => {
      console.error(
        `[conversations] failed to mark ${conversationId} gone after runtime.create error`,
        e,
      );
    });
    throw err;
  }

  const row = await getConversation(conversationId);
  const conv = row as Conversation;

  await conversationCreated.emit({
    conversationId: conv.id,
    taskId: conv.taskId,
    model: conv.model,
    spawnedBy: conv.spawnedBy!,
    createdAt: conv.createdAt.toISOString(),
    prompt: opts.prompt?.trim() || undefined,
    kind: conv.kind,
    prepromptId,
  });

  return conv;
}

export async function deleteConversation(id: string): Promise<void> {
  const row = await getConversationRuntime(id);
  const runtimeId = row?.runtime ?? DEFAULT_RUNTIME;
  await Runtime.get(runtimeId).delete(id);
}

// Shared resume mechanics: clear the stale (dead) pane, reset the row to
// "starting" so the poller tracks the new session (and the 30s STARTING_TIMEOUT
// safety net catches a failed resume → gone), and spawn a fresh `claude --resume`
// pane. Caller must have validated `row.claudeSessionId`. Does NOT touch task
// hold/drop or the hibernation flag — callers own those.
async function respawnResume(row: Conversation): Promise<void> {
  const runtime = Runtime.get(row.runtime);
  // tmux refuses `new-session -s <name>` when a (dead) session by that name
  // still exists. Clear any stale pane before re-spawning.
  await runtime.delete(row.id);

  // Reset status so the poller can track the new session. Without this,
  // "done" rows are skipped and the conversation stays stuck as done.
  await updateConversation(row.id, { status: "starting", endedAt: null });

  await runtime.create(row.id, row.worktreePath, {
    resumeSessionId: row.claudeSessionId!,
    model: row.model,
  });
}

export async function resumeConversation(id: string): Promise<Conversation> {
  const row = await getConversation(id);
  if (!row) throw new Error(`Conversation ${id} not found`);
  if (row.status !== "gone" && row.status !== "done") {
    throw new Error(`Cannot resume conversation ${id} (status: ${row.status})`);
  }
  if (!row.claudeSessionId) {
    throw new Error(`Conversation ${id} has no saved Claude session to resume`);
  }

  await respawnResume(row);

  await updateTask(row.taskId, { drop: false, hold: false });

  return (await getConversation(id)) as Conversation;
}

// Idempotent transparent restore for a hibernated conversation. No-op unless the
// row is actually hibernated (process intentionally absent). On resume it reuses
// the exact proven resume path, then clears the hibernation flag. Status stays
// `waiting`-class to the user (the brief "starting" is invisible — the transcript
// renders from disk). The chokepoint before any live-process interaction
// (viewed/select endpoint, sendTurn).
export async function ensureResumed(id: string): Promise<void> {
  const row = await getConversation(id);
  if (!row) throw new Error(`Conversation ${id} not found`);
  if (!row.hibernatedAt) return;
  if (!row.claudeSessionId) {
    throw new Error(`Conversation ${id} is hibernated but has no saved Claude session to resume`);
  }

  await respawnResume(row);
  await setConversationHibernated(id, null);
}
