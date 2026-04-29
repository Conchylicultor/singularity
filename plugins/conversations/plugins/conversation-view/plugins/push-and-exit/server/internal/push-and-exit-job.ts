import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import {
  recentConversationsResource,
  deleteConversation,
  sendTurn,
  conversationTurnCompleted,
  readConversationTurns,
  type ConversationTurnCompletedPayload,
} from "@plugins/conversations/server";
import { JobStateSchema, type JobState } from "../../shared/resources";
import { CLEAN_TOKEN, FLAG_TOKEN, PUSH_AND_EXIT_PROMPT } from "./prompt";
import { _pushAndExitJobs } from "./tables";

const FINAL_TURN_TIMEOUT_MS = 600_000; // 10 min

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
  schema: z.record(JobStateSchema),
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

// Returns true iff the assistant end_turn with `endTurnMessageId` appears
// in the JSONL transcript AFTER our PUSH_AND_EXIT_PROMPT user message.
// The prompt is the only user message that contains both EXIT_CLEAN
// and FLAG_RAISE (those tokens are mentioned nowhere else by the user
// or by Claude in normal flow), so it's a reliable anchor for "the prompt
// landed in the transcript". Used to filter out a racing end_turn that
// belongs to whatever Claude was doing when push-and-exit was clicked.
async function endTurnIsAfterPushPrompt(
  conversationId: string,
  endTurnMessageId: string | null,
): Promise<boolean> {
  if (!endTurnMessageId) return false;
  const turns = await readConversationTurns(conversationId);
  let promptIdx = -1;
  let endTurnIdx = -1;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (
      t.role === "user" &&
      t.text.includes(CLEAN_TOKEN) &&
      t.text.includes(FLAG_TOKEN)
    ) {
      promptIdx = i;
    }
    if (t.role === "assistant" && t.messageId === endTurnMessageId) {
      endTurnIdx = i;
    }
  }
  return promptIdx !== -1 && endTurnIdx !== -1 && endTurnIdx > promptIdx;
}

// Durable rewrite: handler is restart-safe because every side effect is
// wrapped in `ctx.step` and the 10-minute wait is a `ctx.waitFor` — the
// worker suspends off-CPU and resumes on `conversation.turn-completed`
// (or the timeout, whichever fires first). `maxAttempts: 3` is safe now
// that steps memoize — transient infra failures get retried without
// re-prompting Claude.
export const pushAndExitJob = defineJob({
  name: "push_and_exit.run",
  input: z.object({ conversationId: z.string() }),
  maxAttempts: 3,
  run: async ({ conversationId }, ctx) => {
    await ctx.step("send-prompt", async () => {
      await sendTurn(conversationId, PUSH_AND_EXIT_PROMPT);
    });

    // Loop because `waitFor` resolves on the FIRST end_turn after registration:
    // if Claude was mid-flow when push-and-exit was clicked, that end_turn
    // belongs to the previous user input, not to our injected prompt. Skip
    // any turn whose JSONL position precedes our prompt and wait again, until
    // we see one written after the prompt landed (or the deadline expires).
    const deadline = Date.now() + FINAL_TURN_TIMEOUT_MS;
    let finalText: string | null = null;
    let attempt = 0;
    while (true) {
      attempt++;
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const candidate = await ctx.waitFor<ConversationTurnCompletedPayload>(
        conversationTurnCompleted,
        {
          where: { conversationId },
          timeoutMs: remaining,
          name: `wait-turn-${attempt}`,
        },
      );
      if (!candidate) break;
      const isOurs = await ctx.step(`check-anchor-${attempt}`, () =>
        endTurnIsAfterPushPrompt(conversationId, candidate.messageId),
      );
      if (isOurs) {
        finalText = candidate.text;
        break;
      }
    }

    if (finalText === null) {
      await ctx.step("flag-timeout", () =>
        setStatus(
          conversationId,
          "flag",
          "Claude didn't emit a final message within 10 minutes.",
        ),
      );
      return;
    }

    const verdict = interpret(finalText);
    if (verdict.status === "clean") {
      // Notify with status=clean BEFORE deleting the conversation so the UI
      // sees the success state; otherwise the conversation disappears from
      // listings before the toast can fire.
      await ctx.step("mark-clean", () => setStatus(conversationId, "clean", null));
      await ctx.step("delete-conversation", async () => {
        await deleteConversation(conversationId);
        recentConversationsResource.notify();
      });
    } else {
      await ctx.step("mark-flag", () =>
        setStatus(conversationId, "flag", verdict.text),
      );
    }
  },
});
