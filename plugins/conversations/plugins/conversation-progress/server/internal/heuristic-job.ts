import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { getConversation } from "@plugins/tasks-core/server";
import { PHASE_ORDER, type ConversationPhase } from "../../shared/schemas";
import { _conversationProgress } from "./tables";
import { conversationProgressResource } from "./resource";

const GIT = "/usr/bin/git";

async function gitRun(args: string[], cwd: string): Promise<string | null> {
  const proc = Bun.spawn([GIT, "-C", cwd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  return code === 0 ? out : null;
}

// - research:      no files modified vs main
// - design:        only research/** files modified
// - implementation: any non-research file modified
async function detectPhase(worktreePath: string): Promise<ConversationPhase> {
  const base = (await gitRun(["merge-base", "main", "HEAD"], worktreePath))?.trim();
  if (!base) return "research";

  // Committed + staged + unstaged changes vs merge-base in one pass
  const changed = await gitRun(["diff", "--name-only", base], worktreePath);
  // New untracked files
  const untracked = await gitRun(
    ["ls-files", "--others", "--exclude-standard"],
    worktreePath,
  );

  const files = [
    ...(changed?.split("\n") ?? []),
    ...(untracked?.split("\n") ?? []),
  ].filter(Boolean);

  if (files.length === 0) return "research";
  if (files.some((f) => !f.startsWith("research/"))) return "implementation";
  return "design";
}

// Triggered on every conversationTurnCompleted. Derives the phase from the
// worktree's git state — no LLM call needed.
export const classifyProgressJob = defineJob({
  name: "conversation-progress.classify",
  input: z.object({}).passthrough(),
  event: z.object({ conversationId: z.string() }).passthrough(),
  maxAttempts: 2,
  run: async ({ event }) => {
    const conversationId = event?.conversationId;
    if (!conversationId) return;

    const conversation = await getConversation(conversationId);
    if (!conversation?.worktreePath) return;

    const newPhase = await detectPhase(conversation.worktreePath);

    const existing = await db
      .select({ phase: _conversationProgress.phase })
      .from(_conversationProgress)
      .where(eq(_conversationProgress.conversationId, conversationId))
      .limit(1);
    const prior = existing[0];

    const currentIndex = prior
      ? PHASE_ORDER.indexOf(prior.phase as ConversationPhase)
      : -1;
    if (PHASE_ORDER.indexOf(newPhase) <= currentIndex) return;

    await db
      .insert(_conversationProgress)
      .values({
        conversationId,
        phase: newPhase,
        source: "heuristic",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: _conversationProgress.conversationId,
        set: { phase: newPhase, source: "heuristic", updatedAt: new Date() },
      });

    conversationProgressResource.notify();
  },
});
