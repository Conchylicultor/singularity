import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { recordReport } from "@plugins/reports/server";
import { getConfig } from "@plugins/config_v2/server";
import { setupWorktree } from "@plugins/infra/plugins/worktree/server";
import { compositionsConfig } from "@plugins/plugin-meta/plugins/composition/core";
import { ConversationModelSchema } from "@plugins/conversations/plugins/model-provider/core";
import { EffortLevelSchema } from "@plugins/conversations/plugins/effort-provider/core";
import { ClaudeCodeUnavailableError } from "@plugins/infra/plugins/claude-cli/plugins/availability/server";
import { Runtime } from "./runtime";

// Durable, self-healing conversation spawn. Mirrors `databaseForkJob`: the
// enqueue is a committed graphile-worker row, so an interrupted spawn (backend
// restart mid-checkout, or a crash between `tmux new-session` and the job
// commit) re-runs when the worker reboots instead of leaving the conversation
// stuck `starting` with no session. Both steps are idempotent — `setupWorktree`
// no-ops once the worktree dir exists and `runtime.create` no-ops once a live
// session exists — which is the precondition that makes durable retry safe.
//
// Kept SEPARATE from `databaseForkJob` and enqueued alongside it: the spawn does
// NOT depend on the DB fork (the tmux session only launches the `claude` CLI,
// whose first worktree-DB op happens later at MCP/build time), so the checkout
// and `pg_restore` run in parallel keyed by the same natural id.
export const spawnConversationJob = defineJob({
  name: "conversations.spawn",
  // minutes: `setupWorktree` is a `git worktree add` checkout and
  // `runtime.create` opens a tmux session running the `claude` CLI. Nothing
  // shorter than the work bounds either.
  hold: "minutes",
  inProcess:
    "Both steps are idempotent — `setupWorktree` no-ops once the checkout exists " +
    "and `runtime.create` no-ops once a live session exists — so a spawn killed " +
    "by a restart simply re-runs and skips whatever already landed.",
  input: z.object({
    conversationId: z.string(),
    attemptId: z.string(),
    worktreePath: z.string(),
    runtimeId: z.string(),
    needsWorktreeSetup: z.boolean(),
    create: z.object({
      prompt: z.string().optional(),
      model: ConversationModelSchema,
      effort: EffortLevelSchema.optional(),
      resumeSessionId: z.string().optional(),
      forkSession: z.boolean(),
    }),
  }),
  // Direct-enqueue only (kicked off by createConversation's new-attempt branch).
  event: z.never(),
  // jobKey "conversations.spawn:<conversationId>" — replace-if-not-running.
  dedup: { key: (input) => input.conversationId },
  maxAttempts: 5,
  run: async ({
    input: {
      conversationId,
      attemptId,
      worktreePath,
      runtimeId,
      needsWorktreeSetup,
      create,
    },
    ctx: { signal },
  }) => {
    // Which step threw, for the report: the checkout and the session start fail
    // for different reasons and are fixed in different places.
    let step: "worktree" | "runtime" = "worktree";
    try {
      // `setupWorktree` (git worktree add) MUST precede `runtime.create`: tmux's
      // `-c <worktreePath>` needs the dir to exist. Both are idempotent, so a
      // mid-step crash re-runs the whole body safely.
      if (needsWorktreeSetup) {
        // A checkout claims the namespace of its own name, so `setupWorktree`
        // refuses one a composition already holds. The manifest is read through
        // the config registry (the live view, so a Studio edit counts) here
        // rather than inside `infra/worktree`, which must stay importable from
        // the CLI — `config_v2/server` throws at module eval without a worktree
        // identity.
        //
        // `signal` is this dispatch's deadline. It reaches the host-wide
        // `worktree-mutate` gate and every git child underneath, so a checkout
        // that overruns stops holding one of the box's three worktree slots
        // instead of blocking checkouts on every other backend until the process
        // restarts (the 2026-08-17 shape).
        await setupWorktree(
          attemptId,
          worktreePath,
          new Set(getConfig(compositionsConfig).manifests.map((m) => m.id)),
          signal,
        );
      }
      step = "runtime";
      await Runtime.get(runtimeId).create(conversationId, worktreePath, create);
    } catch (err) {
      // Claude Code went missing between the launch's check and this spawn.
      // Retrying cannot help until the user installs it, so say that — with
      // the fix — and stop. The row stays `starting`, and the poller's
      // starting timeout moves it to `gone`, from where Resume works once
      // Claude Code is back.
      if (err instanceof ClaudeCodeUnavailableError) {
        await recordReport({
          kind: "claude-code-unavailable-at-spawn",
          source: "server-caught",
          message: `${conversationId}: ${err.message}`,
          data: { conversationId, error: err.message },
        });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      await recordReport({
        kind: "conversation-spawn-failed",
        source: "server-caught",
        message: `${conversationId}: ${message}`,
        data: {
          conversationId,
          attemptId,
          worktreePath,
          runtimeId,
          step,
          deadlineAborted: signal.aborted,
          errorType: err instanceof Error ? err.name : typeof err,
          error: err instanceof Error && err.stack ? err.stack : message,
        },
      });
      // Rethrow so graphile retries (and dead-letters after maxAttempts —
      // observable at /api/jobs + queue-health). On exhaustion the row is left
      // `starting`; the poller is the single writer of `starting → gone` and
      // resurrects the row if a late retry finally spawns the session.
      throw err;
    }
  },
});
