import { defineResource } from "../../../../../../../../server/src/resources";
import {
  conversationsResource,
  deleteConversation,
  getConversationRow,
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

async function waitForCondition(
  id: string,
  predicate: (status: string) => boolean,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const row = await getConversationRow(id);
    if (!row) throw new Error(`Conversation ${id} not found`);
    if (predicate(row.status)) return;
    await sleep(2000);
  }
  throw new Error("Timed out waiting for conversation status");
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
    await waitForCondition(conversationId, (s) => s === "working", 60_000);
    await waitForCondition(conversationId, (s) => s !== "working", 600_000);

    const turns = await readConversationTurns(conversationId, triggeredAt);
    const finalAsst = [...turns]
      .reverse()
      .find(
        (t: Turn) => t.role === "assistant" && t.stopReason === "end_turn",
      );

    if (!finalAsst) {
      jobs.set(conversationId, {
        status: "flag",
        text: "Couldn't find Claude's final message in the transcript.",
      });
      pushAndExitResource.notify();
      return;
    }

    const verdict = interpret(finalAsst.text);
    jobs.set(conversationId, verdict);
    pushAndExitResource.notify();

    if (verdict.status === "clean") {
      await deleteConversation(conversationId);
      conversationsResource.notify();
    }
  } catch (err) {
    jobs.set(conversationId, {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    });
    pushAndExitResource.notify();
  }
}
