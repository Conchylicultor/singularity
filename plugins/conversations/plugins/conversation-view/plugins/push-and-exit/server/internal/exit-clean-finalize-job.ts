import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import {
  afterTurn,
  deleteConversation,
} from "@plugins/conversations/server";
import {
  getConversation,
  markConversationClosed,
  maybeDropTaskOnExit,
  notifyConversationsChanged,
} from "@plugins/tasks/plugins/tasks-core/server";
import { recordNotification } from "@plugins/shell/plugins/notifications/server";

const FINALIZE_TIMEOUT_MS = 60_000;

// Spawned by the `exit_clean` MCP tool. Defers `deleteConversation` until
// after the model's current turn ends, so the closing tmux kill doesn't
// race against a still-streaming response. If end_turn doesn't arrive
// within FINALIZE_TIMEOUT_MS we delete anyway — the model has already
// signalled clean exit, so missing the end_turn (transcript poll lag,
// missed event) shouldn't strand the conversation.
export const exitCleanFinalizeJob = defineJob({
  name: "push_and_exit.exit_clean_finalize",
  input: z.object({ conversationId: z.string() }),
  // Direct-enqueue only (spawned by the exit_clean MCP tool).
  event: z.never(),
  dedup: { key: (input) => input.conversationId },
  maxAttempts: 3,
  run: async ({ input: { conversationId }, ctx }) => {
    await afterTurn(ctx, conversationId, { timeoutMs: FINALIZE_TIMEOUT_MS });
    await ctx.step("close-conversation", async () => {
      // An agent that exits without landing any work should return its task to
      // `dropped` rather than leaving it stranded as `attempted` — same policy
      // as the manual "Drop & Close" action. Guarded against pushed work and
      // active sibling conversations inside maybeDropTaskOnExit.
      const conversation = await getConversation(conversationId);
      const dropped = conversation
        ? await maybeDropTaskOnExit(conversation)
        : false;

      await markConversationClosed(conversationId);
      await deleteConversation(conversationId);
      notifyConversationsChanged();
      // Server-side terminus of the clean push-and-exit flow: persist the
      // close notification exactly once (the client used to fire this toast
      // from a per-tab effect, duplicating the row per open tab). The copy
      // reflects whether work actually landed.
      await recordNotification({
        type: "conversation",
        title: dropped ? "Closed without pushing" : "Pushed and closed",
        description: dropped
          ? "No changes were pushed — task marked as dropped"
          : "Branch pushed and conversation closed",
        variant: dropped ? "info" : "success",
        // Full path into the agent-manager namespace (`/agents/c/:convId`).
        linkTo: `/agents/c/${conversationId}`,
        dedupeKey: `push-and-exit-clean:${conversationId}`,
      });
    });
  },
});
