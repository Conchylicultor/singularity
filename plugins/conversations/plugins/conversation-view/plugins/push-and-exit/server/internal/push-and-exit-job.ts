import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import {
  sendTurn,
  conversationTurnCompleted,
  readConversationTurns,
  type ConversationTurnCompletedPayload,
} from "@plugins/conversations/server";
import { PUSH_AND_EXIT_PROMPT, PUSH_AND_EXIT_PROMPT_ANCHOR } from "./prompt";
import { readStatus, setStatus } from "./state";

const FINAL_TURN_TIMEOUT_MS = 600_000; // 10 min

// Returns true iff the assistant end_turn with `endTurnMessageId` appears
// in the JSONL transcript AFTER our PUSH_AND_EXIT_PROMPT user message.
// Anchored on the prompt's distinctive opening line — no other user
// message in normal flow starts with this exact phrase, so it's a
// reliable marker for "the prompt landed in the transcript". Used to
// filter out a racing end_turn that belongs to whatever Claude was doing
// when push-and-exit was clicked.
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
    if (t.role === "user" && t.text.includes(PUSH_AND_EXIT_PROMPT_ANCHOR)) {
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
//
// Verdict comes from the MCP tools `exit_clean` / `flag_raise`, which
// move status off "running" synchronously when the model calls them.
// This job's job is the watchdog: send the prompt, wait for the model
// to end its turn, then check whether a tool fired. If status is still
// "running" after the model's end_turn, the model finished without
// calling either tool — default to flag with a generic reason.
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
    let foundOurs = false;
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
        foundOurs = true;
        break;
      }
    }

    if (!foundOurs) {
      await ctx.step("flag-timeout", () =>
        setStatus(
          conversationId,
          "flag",
          "Claude didn't end its turn within 10 minutes.",
        ),
      );
      return;
    }

    // The model end_turned in response to our prompt. If a tool already
    // fired, status is now "clean" or "flag" and we're done. If status is
    // still "running", the model finished without calling either tool.
    await ctx.step("verdict", async () => {
      const current = await readStatus(conversationId);
      if (current === "running") {
        await setStatus(
          conversationId,
          "flag",
          "Claude ended the turn without calling exit_clean or flag_raise.",
        );
      }
    });
  },
});
