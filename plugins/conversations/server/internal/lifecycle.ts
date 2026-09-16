import { runtimeNamespace } from "@plugins/infra/plugins/runtime-identity/core";
import { existsSync } from "node:fs";
import {
  createTask,
  createAttempt,
  getAttempt,
  insertConversation,
  getConversation,
  getConversationRuntime,
  updateConversation,
  updateTask,
  setConversationHibernated,
  withTaskStatusBatch,
  type DbExecutor,
} from "@plugins/tasks/plugins/tasks-core/server";
import type { EmitTx } from "@plugins/infra/plugins/events/server";
import { Runtime } from "./runtime";
import {
  DEFAULT_MODEL,
  normalizeModel,
  type ConversationModel,
} from "@plugins/conversations/plugins/model-provider/core";
import {
  newAttemptId,
  newConversationId,
  type Conversation,
  type ConversationKind,
} from "@plugins/tasks/plugins/tasks-core/core";
import { databaseForkJob } from "@plugins/database/plugins/fork/server";
import { forkConfig } from "@plugins/config_v2/server";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { attemptBranchName } from "@plugins/infra/plugins/worktree/core";
import { worktreePathFor } from "@plugins/infra/plugins/worktree/server";
import { spawnConversationJob } from "./spawn-job";
import { conversationCreated } from "./tables-created-event";
import { resolveAttachmentRefs } from "./resolve-prompt-attachments";
import { resolvePreprompt } from "@plugins/conversations/plugins/preprompts/server";
import { getTaskPreprompt } from "@plugins/tasks/plugins/task-preprompt/server";
import { getTaskEffort } from "@plugins/tasks/plugins/task-effort/server";
import type { EffortLevel } from "@plugins/conversations/plugins/effort-provider/core";
import { setTaskCategory } from "@plugins/tasks/plugins/task-category/server";
import { wrapPreprompt } from "@plugins/conversations/plugins/transcript-watcher/core";
import type {
  ResumeBlocked,
  ResumeBlockedReason,
  ResumeOutcome,
} from "../../core/resume-outcome";

const DEFAULT_RUNTIME = "tmux";

// The per-task thinking mode (effort), applied to Claude Code at launch and on
// resume. Read live from the task side-table (no per-conversation snapshot), so
// changing a task's mode re-applies on the next launch/resume under it.
async function resolveTaskEffort(
  taskId: string | undefined,
): Promise<EffortLevel | undefined> {
  if (!taskId) return undefined;
  return (await getTaskEffort(taskId))?.level;
}

export interface CreateConversationOpts {
  runtimeId?: string;
  taskId?: string;
  attemptId?: string;
  prompt?: string;
  model?: ConversationModel;
  spawnedBy?: string;
  kind?: ConversationKind;
  forkFromConversationId?: string;
  prepromptId?: string;
  effort?: EffortLevel;
}

// The `runtime.create` options a launch spawns with — the spawn job's `create`
// input, and the inline reuse-branch spawn's options.
interface SpawnCreate {
  prompt?: string;
  model: ConversationModel;
  effort?: EffortLevel;
  resumeSessionId?: string;
  forkSession: boolean;
}

// Everything a conversation launch needs to know, resolved BEFORE any write.
// Produced by `prepareConversation`, consumed by `commitConversation` (the
// writes, on one transaction) and `finishConversation` (what runs after commit).
export interface PreparedConversation {
  runtimeId: string;
  conversationId: string;
  model: ConversationModel;
  spawnedBy: string;
  kind: ConversationKind;
  // The caller's raw prompt, for the `conversationCreated` payload.
  rawPrompt: string | undefined;
  prepromptId: string | undefined;
  worktreePath: string;
  create: SpawnCreate;
  target:
    // Reuse an existing attempt's worktree (fork / +Sonnet / fork-session).
    | { kind: "reuse"; attemptId: string }
    // Mint a new attempt (and a new task when `taskId` is absent).
    | { kind: "new"; attemptId: string; taskId: string | undefined };
}

// Phase 1 of a launch: READS ONLY. Everything slow or off-DB (fork-source
// lookup, the worktree root, attachment resolution, preprompt/effort lookups)
// happens here, before any transaction is open — so a hang here holds no lock
// and has written nothing.
export async function prepareConversation(
  opts: CreateConversationOpts = {},
): Promise<PreparedConversation> {
  const runtimeId = opts.runtimeId ?? DEFAULT_RUNTIME;
  // Resolve now so an unknown runtime throws before anything is written.
  Runtime.get(runtimeId);

  // When forking, inherit the source's attempt (same worktree) and claude
  // session id; let the caller still override `model` so the +Sonnet/+Opus
  // buttons work as expected.
  let resumeSessionId: string | undefined;
  let attemptId = opts.attemptId;
  let inheritedModel: ConversationModel | undefined;
  if (opts.forkFromConversationId) {
    const source = await getConversation(opts.forkFromConversationId);
    if (!source) {
      throw new Error(
        `Source conversation ${opts.forkFromConversationId} not found`,
      );
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

  // The namespace of the backend doing the creating, unless the caller named
  // one. `runtimeNamespace()` throws rather than answering with a guess, so
  // there is no "no worktree" branch left to write.
  const spawnedBy = opts.spawnedBy ?? runtimeNamespace();

  let worktreePath: string;
  let target: PreparedConversation["target"];
  // The task this conversation belongs to, used to resolve a per-task preprompt
  // (baked into the first user turn as a <special_instructions> block). Derived
  // from the existing attempt when reusing a worktree, otherwise the task we
  // launch under — undefined when the commit will create the task, which then
  // has no preprompt or effort of its own yet.
  let effectiveTaskId: string | undefined;

  if (attemptId) {
    const attempt = await getAttempt(attemptId);
    if (!attempt) throw new Error(`Unknown attemptId "${attemptId}"`);
    worktreePath = attempt.worktreePath;
    effectiveTaskId = attempt.taskId;
    target = { kind: "reuse", attemptId };
  } else {
    effectiveTaskId = opts.taskId;
    const newId = newAttemptId();
    // Derived purely from the id, so the path is known before the worktree dir
    // exists. `setupWorktree` (the multi-second `git worktree add` checkout) is
    // deferred to the durable `conversations.spawn` job — off the interactive
    // response — and `createAttempt` inserts a row that carries the
    // not-yet-existent path (it is never existence-checked at write time).
    worktreePath = await worktreePathFor(newId);
    target = { kind: "new", attemptId: newId, taskId: opts.taskId };
  }

  // Single chokepoint for `![](/api/attachments/<id>)` → `@<disk-path>` rewriting
  // so every entry point (HTTP create, agent launch, auto-start) gets it.
  let resolvedPrompt = opts.prompt
    ? (await resolveAttachmentRefs(opts.prompt)).text
    : undefined;

  // Resolve the preprompt (config list-item id → text). An explicit
  // opts.prepromptId (ad-hoc launch input) takes precedence over the task
  // default. A dangling or empty selection resolves to undefined → nothing is
  // injected.
  const prepromptId =
    opts.prepromptId ??
    (effectiveTaskId
      ? (await getTaskPreprompt(effectiveTaskId))?.prepromptId
      : undefined);
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

  // Thinking mode: an explicit opts.effort (ad-hoc launch input) wins; otherwise
  // the launching task's default. Threaded to the runtime as CLI args; no prompt
  // mutation (unlike preprompt, ultracode rides --settings, not the transcript).
  const effort = opts.effort ?? (await resolveTaskEffort(effectiveTaskId));

  return {
    runtimeId,
    conversationId: newConversationId(),
    model,
    spawnedBy,
    kind: opts.kind ?? "user",
    rawPrompt: opts.prompt,
    prepromptId,
    worktreePath,
    target,
    create: {
      prompt: resolvedPrompt,
      model,
      effort,
      resumeSessionId,
      forkSession: !!opts.forkFromConversationId,
    },
  };
}

// Phase 2 of a launch: WRITES ONLY, every one on `tx`. The task (when there is
// none), the attempt, the durable fork + spawn jobs, the conversation row and
// its `conversationCreated` emit commit together or not at all — a throw, a
// crash or a killed connection anywhere in here leaves no attempt without a
// conversation (no phantom "In progress") and no job for rows that do not
// exist. Run it inside `withTaskStatusBatch` (or `runStatusBatchOn`): the
// status-changing writes assert they are on the batch's tx.
export async function commitConversation(
  tx: DbExecutor,
  p: PreparedConversation,
): Promise<Conversation> {
  // `EmitTx`/`EnqueueTx` name the NodePgDatabase facade; a PgTransaction is
  // structurally that at runtime (same narrow cast as tasks-core's
  // `withTaskStatusChange`).
  const queueTx = tx as EmitTx;

  if (p.target.kind === "new") {
    const { attemptId } = p.target;
    let taskId = p.target.taskId;
    if (!taskId) {
      const task = await createTask(
        { title: "Untitled", author: p.spawnedBy },
        tx,
      );
      await setTaskCategory(
        task.id,
        p.kind === "system" ? "system" : "conversations",
        tx,
      );
      taskId = task.id;
    }
    await createAttempt(
      { id: attemptId, taskId, worktreePath: p.worktreePath },
      tx,
    );
    // The fork is a detached supervised job: it runs in its own process, so a
    // backend restart mid-fork does not interrupt it (the workflow re-attaches
    // to the running child). The enqueue is a row on this transaction, so it
    // exists iff the attempt does. A failed fork retries, then dead-letters
    // (Debug → Queue) with a deduped fork-error notification; its output is on
    // the `database-fork` log channel (`logs/database-fork.jsonl`).
    await databaseForkJob.enqueue(
      { source: "singularity", target: attemptId },
      { tx: queueTx },
    );
  }

  const conv = await insertConversation(
    {
      id: p.conversationId,
      attemptId: p.target.attemptId,
      runtime: p.runtimeId,
      model: p.model,
      spawnedBy: p.spawnedBy,
      kind: p.kind,
    },
    tx,
  );

  // Emit right after insert — the subscribers (title-gen, queue-rank, preprompt
  // snapshot) need only the row, never the live session — so it fires whether the
  // spawn happens inline (reuse branch) or in the background job (new branch).
  // On `tx`, so no subscriber job exists for a conversation that rolled back.
  await conversationCreated.emit(
    {
      conversationId: conv.id,
      taskId: conv.taskId,
      model: conv.model,
      spawnedBy: conv.spawnedBy!,
      createdAt: conv.createdAt.toISOString(),
      prompt: p.rawPrompt?.trim() || undefined,
      kind: conv.kind,
      prepromptId: p.prepromptId,
    },
    { tx: queueTx },
  );

  if (p.target.kind === "new") {
    // New-worktree branch: background the multi-second `git worktree add` +
    // `runtime.create` in a durable graphile job so the interactive Launch
    // response returns immediately with a `starting` row. It has no ordering
    // dependency on the DB fork. On failure the job records a deduped
    // notification and retries; the poller owns the eventual
    // `starting → gone` transition.
    await spawnConversationJob.enqueue(
      {
        conversationId: p.conversationId,
        attemptId: p.target.attemptId,
        worktreePath: p.worktreePath,
        runtimeId: p.runtimeId,
        needsWorktreeSetup: true,
        create: p.create,
      },
      { tx: queueTx },
    );
  }

  return conv;
}

// Phase 3 of a launch: what runs only once the commit has landed.
export async function finishConversation(
  p: PreparedConversation,
): Promise<void> {
  if (p.target.kind === "new") {
    // Copy main's config dir for the new worktree. Fire-and-forget, as before,
    // but only after commit: a rolled-back launch leaves no config dir behind.
    const { attemptId } = p.target;
    void runTracked("conversations:fork-config", () => forkConfig(attemptId));
    return;
  }

  // Reuse-attempt branch (fork / +Sonnet / fork-session): the worktree already
  // exists and the only spawn step (`runtime.create`) is sub-second, so keep it
  // synchronous — no job-pickup latency for the interactive fork buttons.
  try {
    await Runtime.get(p.runtimeId).create(
      p.conversationId,
      p.worktreePath,
      p.create,
    );
  } catch (err) {
    // Without this, the row stays at "starting" forever — the poller skips
    // starting rows, and the UI just shows "Starting…" with a terminal pane
    // that prints "can't find session" because tmux never created one.
    // eslint-disable-next-line promise-safety/no-bare-catch
    await updateConversation(p.conversationId, {
      status: "gone",
      endedAt: new Date(),
    }).catch((e) => {
      console.error(
        `[conversations] failed to mark ${p.conversationId} gone after runtime.create error`,
        e,
      );
    });
    throw err;
  }
}

// prepare (reads) → commit (one transaction) → finish (post-commit effects).
export async function createConversation(
  opts: CreateConversationOpts = {},
): Promise<Conversation> {
  const prepared = await prepareConversation(opts);
  const conv = await withTaskStatusBatch((tx) =>
    commitConversation(tx, prepared),
  );
  await finishConversation(prepared);
  return conv;
}

export async function deleteConversation(id: string): Promise<void> {
  const row = await getConversationRuntime(id);
  const runtimeId = row?.runtime ?? DEFAULT_RUNTIME;
  await Runtime.get(runtimeId).delete(id);
}

// Thrown by the resume paths that map onto a request/response (the toolbar
// Resume button). The transparent hibernation path returns the same information
// as a `ResumeOutcome` instead — same check, two shapes, one definition.
export class ResumeBlockedError extends Error {
  constructor(
    readonly reason: ResumeBlockedReason,
    message: string,
  ) {
    super(message);
    this.name = "ResumeBlockedError";
  }
}

// Everything that must be true before a conversation can be handed to
// `claude --resume`. Pure and side-effect free ON PURPOSE: a refusal has to
// leave the conversation byte-for-byte as it was, so this runs before the stale
// pane is killed and before any status is written.
//
// The worktree check is the load-bearing one. A conversation's checkout can be
// reclaimed underneath it while its branch and transcript survive, and
// `tmux new-session -c <missing-dir>` does NOT fail on a missing directory — it
// silently starts the pane in $HOME. Unchecked, resuming such a conversation
// boots the agent in the user's home directory with a transcript full of
// repo-relative paths, and the only symptom is a trust prompt for `~`.
function preflightResume(row: Conversation): { kind: "ok" } | ResumeBlocked {
  if (!row.claudeSessionId) {
    return {
      kind: "blocked",
      reason: "no-session",
      message: `Conversation ${row.id} has no saved Claude session to resume.`,
    };
  }
  if (!existsSync(row.worktreePath)) {
    const branch = attemptBranchName(row.attemptId);
    return {
      kind: "blocked",
      reason: "worktree-missing",
      message:
        `This conversation's worktree checkout is gone (${row.worktreePath}), so it cannot be resumed. ` +
        `Its branch ${branch} still exists — recreate the checkout with ` +
        `\`git worktree add ${row.worktreePath} ${branch}\` to bring the conversation back.`,
    };
  }
  return { kind: "ok" };
}

// Shared resume mechanics: clear the stale (dead) pane, reset the row to
// "starting" so the poller tracks the new session (and the 30s STARTING_TIMEOUT
// safety net catches a failed resume → gone), and spawn a fresh `claude --resume`
// pane. Does NOT touch task hold/drop or the hibernation flag — callers own those.
//
// Re-runs `preflightResume` as the invariant guard rather than trusting callers:
// every statement below is destructive (kills the pane, rewrites status), so the
// check must sit at the mutation, not one frame above it.
async function respawnResume(row: Conversation): Promise<void> {
  const preflight = preflightResume(row);
  if (preflight.kind === "blocked") {
    throw new ResumeBlockedError(preflight.reason, preflight.message);
  }

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
    effort: await resolveTaskEffort(row.taskId),
  });
}

export async function resumeConversation(id: string): Promise<Conversation> {
  const row = await getConversation(id);
  if (!row) throw new Error(`Conversation ${id} not found`);
  if (row.status !== "gone" && row.status !== "done") {
    throw new Error(`Cannot resume conversation ${id} (status: ${row.status})`);
  }

  // Refuse before `respawnResume` touches anything, so a blocked resume leaves
  // the conversation exactly where the user left it. (`respawnResume` asserts
  // the same invariant; this call is what turns it into a clean 409 with an
  // actionable message rather than a generic failure.)
  const preflight = preflightResume(row);
  if (preflight.kind === "blocked") {
    throw new ResumeBlockedError(preflight.reason, preflight.message);
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
//
// Returns a `ResumeOutcome` rather than throwing on a blocked resume: this fires
// on every conversation open, so its failure arm has to be something the caller
// can render. A blocked outcome deliberately leaves BOTH `status` and
// `hibernatedAt` untouched — the conversation stays a normal hibernated,
// still-active entry in the user's list. Losing track of a conversation because
// its checkout was reclaimed would be a worse bug than the one being reported.
export async function ensureResumed(id: string): Promise<ResumeOutcome> {
  const row = await getConversation(id);
  if (!row) throw new Error(`Conversation ${id} not found`);
  if (!row.hibernatedAt) return { kind: "not-hibernated" };

  const preflight = preflightResume(row);
  if (preflight.kind === "blocked") return preflight;

  await respawnResume(row);
  await setConversationHibernated(id, null);
  return { kind: "resumed" };
}
