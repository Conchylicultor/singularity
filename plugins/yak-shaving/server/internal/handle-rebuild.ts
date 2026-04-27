import fs from "node:fs/promises";
import {
  createConversation,
  deleteConversation,
} from "@plugins/conversations/server";
import { buildRebuildPayload } from "./queries";

// Best-effort upper bound for how long the rebuild conversation should be
// allowed to live. After this, the tmux pane is reaped even if Sonnet hasn't
// finished. The conversation poller (which sees system conversations via
// listConversationsForInfra()) will then mark the DB row gone.
const CLEANUP_AFTER_MS = 5 * 60 * 1000;

// Kicks off a one-shot Sonnet conversation that reconciles the yak-shaving
// tree against the current set of active conversations. The model uses the
// yak_* MCP tools to add new nodes, remove stale ones, and re-parent or
// re-label any that drifted. Runs in its own worktree like any other
// conversation; `kind: "system"` keeps it out of user-facing lists and
// parents the auto-created task under SYSTEM_META_TASK_ID.
//
// The bulky context (existing tree + active conversations with first-turn
// excerpts) is written to /tmp instead of inlined in the prompt — tmux's
// per-arg cap (~16KB on 3.6a) refuses long `-e SINGULARITY_PROMPT=…` values
// with a silent "command too long" exit. The conversation reads the file
// via its Read tool on first turn.
export async function handleRebuild(_req: Request): Promise<Response> {
  const contextPath = `/tmp/singularity-yak-rebuild-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.xml`;
  const { prompt, context } = await buildRebuildPayload(contextPath);
  await fs.writeFile(contextPath, context, "utf8");

  const conv = await createConversation({
    prompt,
    model: "sonnet",
    kind: "system",
    spawnedBy: "yak-shaving",
  });
  setTimeout(() => {
    deleteConversation(conv.id).catch((err) => {
      console.error(`[yak-shaving] cleanup of ${conv.id} failed`, err);
    });
    fs.unlink(contextPath).catch(() => {});
  }, CLEANUP_AFTER_MS).unref();
  return Response.json({ conversationId: conv.id }, { status: 202 });
}
