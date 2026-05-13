import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import {
  afterTurn,
  deleteConversation,
} from "@plugins/conversations/server";
import { markConversationClosed, notifyConversationsChanged } from "@plugins/tasks-core/server";

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
  maxAttempts: 3,
  run: async ({ input: { conversationId }, ctx }) => {
    await afterTurn(ctx, conversationId, { timeoutMs: FINALIZE_TIMEOUT_MS });
    await ctx.step("close-conversation", async () => {
      await markConversationClosed(conversationId);
      await deleteConversation(conversationId);
      notifyConversationsChanged();
    });
  },
});
