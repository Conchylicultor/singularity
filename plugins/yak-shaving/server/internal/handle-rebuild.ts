import {
  createConversation,
  deleteConversation,
  SYSTEM_BATCH_ATTEMPT_ID,
} from "@plugins/conversations/server";
import { buildRebuildPayload } from "./queries";

// Best-effort upper bound for how long the rebuild conversation should be
// allowed to live. After this, the tmux pane is reaped even if Sonnet hasn't
// finished. The conversation poller (which sees system conversations via
// listConversations()) will then mark the DB row gone.
const CLEANUP_AFTER_MS = 5 * 60 * 1000;

// Kicks off a one-shot Sonnet conversation that reconciles the yak-shaving
// tree against the current set of active conversations. The model uses the
// yak_* MCP tools to add new nodes, remove stale ones, and re-parent or
// re-label any that drifted. The conversation is pinned to
// SYSTEM_BATCH_ATTEMPT_ID and `kind: "system"` so it stays out of user
// surfaces.
export async function handleRebuild(_req: Request): Promise<Response> {
  const prompt = await buildRebuildPayload();
  const conv = await createConversation({
    attemptId: SYSTEM_BATCH_ATTEMPT_ID,
    prompt,
    model: "sonnet",
    kind: "system",
    spawnedBy: "yak-shaving",
  });
  setTimeout(() => {
    deleteConversation(conv.id).catch((err) => {
      console.error(`[yak-shaving] cleanup of ${conv.id} failed`, err);
    });
  }, CLEANUP_AFTER_MS).unref();
  return Response.json({ conversationId: conv.id }, { status: 202 });
}
