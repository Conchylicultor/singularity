import { useSyncExternalStore } from "react";

// ---------------------------------------------------------------------------
// Pending-turn store. The moment a turn POST succeeds the prompt editor clears,
// but the sent message isn't echoed anywhere (the transcript is 100% driven by
// the server JSONL stream) and the conversation status stays `waiting` until a
// poller flips it to `working`. That gap shows nothing. This module-level store
// holds the just-sent text per conversation so the transcript pane can echo a
// dimmed "Sending…" card until the real user-text event streams in.
//
// State per conversation id is `{ sendId, text } | undefined`. `sendId` is a
// monotonic module counter so a re-send (after a previous entry was cleared)
// always produces a fresh id the consumer can key effects on.
// ---------------------------------------------------------------------------

export interface PendingTurn {
  sendId: number;
  text: string;
}

const entries = new Map<string, PendingTurn>();
const listeners = new Set<() => void>();
let sendCounter = 0;

function notify(): void {
  for (const listener of listeners) listener();
}

export function markTurnSent(conversationId: string, text: string): void {
  entries.set(conversationId, { sendId: ++sendCounter, text });
  notify();
}

export function clearPendingTurn(conversationId: string): void {
  if (entries.delete(conversationId)) notify();
}

export function usePendingTurn(conversationId: string): PendingTurn | undefined {
  const subscribe = (onChange: () => void) => {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  };
  // getSnapshot must return a STABLE reference per state — the Map stores the
  // same object until markTurnSent/clearPendingTurn replaces it, so this never
  // loops useSyncExternalStore.
  const getSnapshot = () => entries.get(conversationId);
  const getServerSnapshot = () => undefined;
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
