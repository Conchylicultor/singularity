import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import { defineJob } from "@plugins/jobs/server";
import {
  recentConversationsResource,
  deleteConversation,
  readConversationTurns,
  sendTurn,
  type Turn,
} from "@plugins/conversations/server";
import type { JobState } from "../../shared/resources";
import { CLEAN_TOKEN, FLAG_TOKEN, PUSH_AND_EXIT_PROMPT } from "./prompt";
import { _pushAndExitJobs } from "./tables";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitForFinalTurn(
  id: string,
  since: string,
  timeoutMs: number,
): Promise<Turn | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const turns = await readConversationTurns(id, since);
    const match = turns.find(
      (t) =>
        t.role === "assistant" &&
        t.stopReason === "end_turn" &&
        (t.text.includes(CLEAN_TOKEN) || t.text.includes(FLAG_TOKEN)),
    );
    if (match) return match;
    await sleep(2000);
  }
  return null;
}

function interpret(
  turnText: string,
): { status: "clean" } | { status: "flag"; text: string } {
  const trimmed = turnText.replace(/\s+$/, "");
  const lines = trimmed.split("\n");
  const last = lines[lines.length - 1]?.trim() ?? "";
  const rest = lines.slice(0, -1).join("\n").trim();
  if (last === CLEAN_TOKEN) return { status: "clean" };
  if (last === FLAG_TOKEN) return { status: "flag", text: rest };
  return { status: "flag", text: trimmed };
}

function rowToState(row: typeof _pushAndExitJobs.$inferSelect): JobState {
  switch (row.status) {
    case "running":
      return { status: "running" };
    case "clean":
      return { status: "clean" };
    case "flag":
      return { status: "flag", text: row.detail ?? "" };
    case "error":
      return { status: "error", message: row.detail ?? "" };
  }
}

export const pushAndExitResource = defineResource({
  key: "push-and-exit",
  mode: "push",
  loader: async (): Promise<Record<string, JobState>> => {
    const rows = await db.select().from(_pushAndExitJobs);
    return Object.fromEntries(rows.map((r) => [r.conversationId, rowToState(r)]));
  },
});

async function setStatus(
  conversationId: string,
  status: JobState["status"],
  detail: string | null,
): Promise<void> {
  await db
    .update(_pushAndExitJobs)
    .set({ status, detail, updatedAt: new Date() })
    .where(eq(_pushAndExitJobs.conversationId, conversationId));
  pushAndExitResource.notify();
}

// maxAttempts: 1 — the handler catches every business failure and writes a
// terminal row, so only infra errors (DB, network to Graphile) can throw.
// Silently re-prompting Claude on infra retries would be worse than surfacing
// the error. Server-crash-mid-job is an accepted edge (see the migration plan
// at research/2026-04-24-push-and-exit-jobs-migration.md §Risks).
export const pushAndExitJob = defineJob({
  name: "push_and_exit.run",
  input: z.object({ conversationId: z.string() }),
  maxAttempts: 1,
  run: async ({ conversationId }) => {
    const triggeredAt = new Date().toISOString();
    try {
      await sendTurn(conversationId, PUSH_AND_EXIT_PROMPT);

      const finalTurn = await waitForFinalTurn(conversationId, triggeredAt, 600_000);

      if (!finalTurn) {
        await setStatus(
          conversationId,
          "flag",
          "Couldn't find Claude's final message in the transcript.",
        );
        return;
      }

      const verdict = interpret(finalTurn.text);
      if (verdict.status === "clean") {
        // Notify with status=clean BEFORE deleting the conversation so the UI
        // sees the success state; otherwise the conversation disappears from
        // listings before the toast can fire.
        await setStatus(conversationId, "clean", null);
        await deleteConversation(conversationId);
        recentConversationsResource.notify();
      } else {
        await setStatus(conversationId, "flag", verdict.text);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await setStatus(conversationId, "error", message);
    }
  },
});
