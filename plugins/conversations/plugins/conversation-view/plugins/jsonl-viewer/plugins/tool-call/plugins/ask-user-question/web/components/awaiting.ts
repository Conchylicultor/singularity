import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { isInterruptContent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { ANSWER_MARKER } from "../../shared";

/**
 * Locates the follow-up answer turn for a given AskUserQuestion tool-call:
 * scans forward from the tool-call, bounded by the next tool-call (the window
 * for this question), and returns the first `user-text` event whose trimmed
 * text starts with `ANSWER_MARKER`. A windowed, marker-keyed lookup — not a
 * blind positional scan. Returns the event's text, or null.
 */
export function findAnswerTurn(
  events: JsonlEvent[] | undefined,
  toolUseId: string,
): string | null {
  if (!events) return null;
  const startIdx = events.findIndex(
    (e) => e.kind === "tool-call" && e.toolUseId === toolUseId,
  );
  if (startIdx === -1) return null;
  for (let i = startIdx + 1; i < events.length; i++) {
    const e = events[i]!;
    if (e.kind === "tool-call") break; // window boundary: next tool-call
    if (e.kind === "user-text" && e.text.trim().startsWith(ANSWER_MARKER)) {
      return e.text;
    }
  }
  return null;
}

/**
 * The AskUserQuestion whose inline answer form is (or should be) showing — i.e.
 * a question genuinely awaiting an answer in the JSONL: the most recent
 * tool-call is an AskUserQuestion carrying the interrupt/rejection-sentinel
 * result, with no following answer turn yet.
 *
 * This must NOT match a *past* question already answered from the web: that
 * one's result is permanently the interrupt sentinel too (the web-answer flow
 * cancels the tool first), but it has an answer turn after it and is usually no
 * longer the last tool-call. Returns the awaiting event, or null.
 *
 * Hosts use this to decide whether the generic pending-prompt indicator should
 * defer to the card's own inline form, so the two never double up.
 */
export function findAwaitingAuqEvent(
  events: JsonlEvent[] | undefined,
): JsonlEvent | null {
  if (!events) return null;
  const lastToolCall = events.findLast((e) => e.kind === "tool-call");
  if (lastToolCall?.kind !== "tool-call") return null;
  if (lastToolCall.name !== "AskUserQuestion") return null;
  if (
    lastToolCall.result == null ||
    lastToolCall.result.isError !== true ||
    !isInterruptContent(lastToolCall.result.content)
  ) {
    return null;
  }
  if (findAnswerTurn(events, lastToolCall.toolUseId) != null) return null;
  return lastToolCall;
}
