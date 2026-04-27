import {
  createConversation,
  deleteConversation,
  SYSTEM_BATCH_ATTEMPT_ID,
} from "@plugins/conversations/server";
import { buildRebuildPayload, clearYakTree } from "./queries";

// Best-effort upper bound for how long the rebuild conversation should be
// allowed to live. After this, the tmux pane is reaped even if Sonnet
// hasn't finished — system conversations bypass the conversation poller
// (it filters out kind="system"), so nothing else cleans them up.
const CLEANUP_AFTER_MS = 5 * 60 * 1000;

// Wipes the yak-shaving tree and kicks off a one-shot Sonnet conversation
// pinned to SYSTEM_BATCH_ATTEMPT_ID. The model uses the existing yak_*
// MCP tools to repopulate the tree as it streams its turn.
//
// The conversation is `kind: "system"` so it stays out of user-facing
// listings; the SYSTEM_BATCH_ATTEMPT_ID sentinel exists exactly for this
// pattern (see plugins/conversations/server/internal/meta-system.ts).
//
// `spawnedBy` is intentionally omitted so it defaults to SINGULARITY_WORKTREE.
// That env var is what the tmux runtime exports as SINGULARITY_PARENT_HOST,
// which Claude's .mcp.json uses to dial back to *this* worktree's MCP server.
// Setting spawnedBy to anything else (e.g. "yak-shaving") routes MCP to a
// non-existent host and the model falls back to bash+curl on the main
// namespace, writing nodes into the wrong DB.
export async function handleRebuild(_req: Request): Promise<Response> {
  const prompt = await buildRebuildPayload();
  await clearYakTree();
  const conv = await createConversation({
    attemptId: SYSTEM_BATCH_ATTEMPT_ID,
    prompt,
    model: "sonnet",
    kind: "system",
  });
  setTimeout(() => {
    deleteConversation(conv.id).catch((err) => {
      console.error(`[yak-shaving] cleanup of ${conv.id} failed`, err);
    });
  }, CLEANUP_AFTER_MS).unref();
  return Response.json({ conversationId: conv.id }, { status: 202 });
}
