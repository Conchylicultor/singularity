import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { recordNotification } from "@plugins/shell/plugins/notifications/server";
import { setupWorktree } from "@plugins/infra/plugins/worktree/server";
import { ConversationModelSchema } from "@plugins/conversations/plugins/model-provider/core";
import { EffortLevelSchema } from "@plugins/conversations/plugins/effort-provider/core";
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
    input: { conversationId, attemptId, worktreePath, runtimeId, needsWorktreeSetup, create },
  }) => {
    try {
      // `setupWorktree` (git worktree add) MUST precede `runtime.create`: tmux's
      // `-c <worktreePath>` needs the dir to exist. Both are idempotent, so a
      // mid-step crash re-runs the whole body safely.
      if (needsWorktreeSetup) {
        await setupWorktree(attemptId, worktreePath);
      }
      await Runtime.get(runtimeId).create(conversationId, worktreePath, create);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordNotification({
        type: "conversation",
        title: "Conversation spawn failed",
        description: `${conversationId}: ${message}`,
        variant: "error",
        dedupeKey: `spawn-error:${conversationId}`,
      });
      // Rethrow so graphile retries (and dead-letters after maxAttempts —
      // observable at /api/jobs + queue-health). On exhaustion the row is left
      // `starting`; the poller is the single writer of `starting → gone` and
      // resurrects the row if a late retry finally spawns the session.
      throw err;
    }
  },
});
