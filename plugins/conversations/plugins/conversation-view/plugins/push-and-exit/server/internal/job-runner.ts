import { defineResource } from "../../../../../../../../server/src/resources";
import {
  recentConversationsResource,
  deleteConversation,
  readConversationTurns,
  sendTurn,
  type Turn,
} from "@plugins/conversations/server";
import { CLEAN_TOKEN, FLAG_TOKEN, PUSH_AND_EXIT_PROMPT } from "./prompt";
import type { JobState } from "../../shared/resources";

export const jobs = new Map<string, JobState>();

export const pushAndExitResource = defineResource({
  key: "push-and-exit",
  mode: "push",
  loader: async () => Object.fromEntries(jobs),
});

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

export async function runJob(conversationId: string): Promise<void> {
  const triggeredAt = new Date().toISOString();
  try {
    await sendTurn(conversationId, PUSH_AND_EXIT_PROMPT);

    const finalTurn = await waitForFinalTurn(conversationId, triggeredAt, 600_000);

    if (!finalTurn) {
      jobs.set(conversationId, {
        status: "flag",
        text: "Couldn't find Claude's final message in the transcript.",
      });
      pushAndExitResource.notify();
      return;
    }

    const verdict = interpret(finalTurn.text);
    jobs.set(conversationId, verdict);
    pushAndExitResource.notify();

    if (verdict.status === "clean") {
      await deleteConversation(conversationId);
      recentConversationsResource.notify();
    }
  } catch (err) {
    jobs.set(conversationId, {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    });
    pushAndExitResource.notify();
  }
}
