import { sql } from "drizzle-orm";
import { isActiveStatus } from "../../core";
import { listConversationsForInfra } from "@plugins/tasks-core/server";
import { db, isTransientDbError } from "@plugins/database/server";
import { watchTranscript } from "@plugins/conversations/plugins/transcript-watcher/server";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import {
  _conversationTurnCompletedTriggers,
  conversationTurnCompleted,
} from "./tables-turn-completed-event";

// Poll cadence for active-conversation discovery. File reads are now
// event-driven (transcript-watcher); this loop only manages subscriptions.
const POLL_MS = 5_000;

// conversationId → unsubscribe
const subscriptions = new Map<string, () => void>();

let timer: ReturnType<typeof setInterval> | null = null;

export function startTurnEmitter(): void {
  if (timer) return;
  void tick();
  timer = setInterval(() => void tick(), POLL_MS);
}

export function stopTurnEmitter(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  for (const unsub of subscriptions.values()) unsub();
  subscriptions.clear();
}

async function tick(): Promise<void> {
  let convs: Awaited<ReturnType<typeof listConversationsForInfra>>;
  try {
    convs = await listConversationsForInfra();
  } catch (err) {
    if (!isTransientDbError(err)) {
      console.error("[conversations.turn-emitter] listConversationsForInfra failed", err);
    }
    return;
  }

  const activeIds = new Set<string>();
  for (const c of convs) {
    if (!isActiveStatus(c.status)) continue;
    activeIds.add(c.id);
  }

  // Unsubscribe from conversations that are no longer active.
  for (const id of subscriptions.keys()) {
    if (!activeIds.has(id)) {
      subscriptions.get(id)?.();
      subscriptions.delete(id);
    }
  }

  // Subscribe to newly active conversations.
  for (const id of activeIds) {
    if (!subscriptions.has(id)) {
      subscriptions.set(id, subscribeToConversation(id));
    }
  }
}

type EndTurnEvent = Extract<JsonlEvent, { kind: "assistant-text" }> & {
  messageId: string;
};

function subscribeToConversation(conversationId: string): () => void {
  let hasPrimed = false;
  const emittedIds = new Set<string>();

  async function handleEvents(events: JsonlEvent[]): Promise<void> {
    const endTurns = events.filter(
      (e): e is EndTurnEvent =>
        e.kind === "assistant-text" &&
        e.stopReason === "end_turn" &&
        typeof e.messageId === "string",
    );

    if (!hasPrimed) {
      // First callback (seed read): populate dedupe set without emitting.
      // Exception: if a durable job is waiting on this conversation, replay
      // the most recent end_turn so it can resume after a server restart.
      for (const t of endTurns) emittedIds.add(t.messageId);
      hasPrimed = true;
      if (endTurns.length > 0 && (await hasPendingTrigger(conversationId))) {
        const latest = endTurns[endTurns.length - 1];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
        if (latest) await emitEndTurn(conversationId, latest);
      }
      return;
    }

    for (const t of endTurns) {
      if (emittedIds.has(t.messageId)) continue;
      emittedIds.add(t.messageId);
      await emitEndTurn(conversationId, t);
    }
  }

  return watchTranscript(conversationId, (events) => {
    void handleEvents(events);
  });
}

async function emitEndTurn(conversationId: string, turn: EndTurnEvent): Promise<void> {
  try {
    await conversationTurnCompleted.emit({
      conversationId,
      stopReason: "end_turn",
      text: turn.text,
      messageId: turn.messageId,
    });
  } catch (err) {
    console.error(`[conversations.turn-emitter] emit failed for ${conversationId}`, err);
  }
}

// A durable workflow is "waiting" on this conversation iff the events plugin
// has at least one enabled trigger row keyed to it.
async function hasPendingTrigger(conversationId: string): Promise<boolean> {
  const result = await db.execute<{ id: string }>(
    sql`SELECT id FROM ${_conversationTurnCompletedTriggers}
        WHERE enabled = true AND conversation_id = ${conversationId}
        LIMIT 1`,
  );
  return result.rows.length > 0;
}
