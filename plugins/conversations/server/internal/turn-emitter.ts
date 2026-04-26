import { sql } from "drizzle-orm";
import { isActiveStatus } from "../../shared";
import {
  getConversationClaudeSessionId,
  listConversations,
} from "@plugins/tasks-core/server";
import { db } from "@server/db/client";
import { findTranscriptPath } from "./claude-transcript";
import {
  _conversationTurnCompletedTriggers,
  conversationTurnCompleted,
} from "./tables-turn-completed-event";

// Poll cadence for the always-on end_turn emitter. We want durable workflows
// waiting on `conversation.turn-completed` to resume promptly, but we also
// don't want to thrash the filesystem — 500ms is the same budget the UI-side
// JSONL viewer uses for its watchers, so the two are in line.
const POLL_MS = 500;

interface RoomState {
  claudeSessionId: string | null;
  transcriptPath: string | null;
  lastMtimeMs: number;
  emittedEndTurnIds: Set<string>;
  /**
   * First successful read PRIMES the dedupe set without emitting in the
   * default case: we can't tell which turns predate server start vs landed
   * during a restart, and re-firing an already-past turn would wrongly
   * resolve a waitFor from another in-flight workflow. EXCEPTION: if there
   * is a pending durable-jobs trigger row matching this conversationId,
   * we replay the most recent end_turn so a workflow that suspended just
   * before the restart can resume — the wait was registered specifically
   * for this conversation, so re-emitting cannot cross-pollinate other
   * subscribers.
   */
  hasPrimed: boolean;
}

const rooms = new Map<string, RoomState>();

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
  rooms.clear();
}

async function tick(): Promise<void> {
  let convs: Awaited<ReturnType<typeof listConversations>>;
  try {
    convs = await listConversations();
  } catch (err) {
    console.error("[conversations.turn-emitter] listConversations failed", err);
    return;
  }

  const activeIds = new Set<string>();
  for (const c of convs) {
    if (!isActiveStatus(c.status)) continue;
    activeIds.add(c.id);
  }

  // Evict rooms for conversations that are no longer active (gone/deleted).
  for (const id of rooms.keys()) {
    if (!activeIds.has(id)) rooms.delete(id);
  }

  await Promise.all(
    [...activeIds].map((id) =>
      pollRoom(id).catch((err) => {
        console.error(`[conversations.turn-emitter] ${id} tick failed`, err);
      }),
    ),
  );
}

async function pollRoom(conversationId: string): Promise<void> {
  let room = rooms.get(conversationId);
  if (!room) {
    room = {
      claudeSessionId: null,
      transcriptPath: null,
      lastMtimeMs: 0,
      emittedEndTurnIds: new Set(),
      hasPrimed: false,
    };
    rooms.set(conversationId, room);
  }

  if (room.claudeSessionId === null) {
    const sid = await getConversationClaudeSessionId(conversationId);
    if (sid === undefined) return;
    if (sid) room.claudeSessionId = sid;
    else return;
  }
  if (!room.transcriptPath) {
    const path = await findTranscriptPath(room.claudeSessionId);
    if (!path) return;
    room.transcriptPath = path;
  }

  const file = Bun.file(room.transcriptPath);
  if (!(await file.exists())) return;
  const mtime = file.lastModified;
  if (mtime === room.lastMtimeMs) return;
  room.lastMtimeMs = mtime;

  const lines = (await file.text()).split("\n");
  const endTurns = extractEndTurns(lines);

  if (!room.hasPrimed) {
    for (const t of endTurns) room.emittedEndTurnIds.add(t.messageId);
    room.hasPrimed = true;

    if (endTurns.length > 0 && (await hasPendingTrigger(conversationId))) {
      // A durable workflow is waiting on this conversation; the most recent
      // end_turn is the candidate it would have woken on. The waiting
      // handler re-checks the payload itself (token interpretation), so a
      // false positive here just resumes the handler — it doesn't decide
      // verdict.
      const latest = endTurns[endTurns.length - 1];
      if (latest) {
        try {
          await conversationTurnCompleted.emit({
            conversationId,
            stopReason: "end_turn",
            text: latest.text,
            messageId: latest.messageId,
          });
        } catch (err) {
          console.error(
            `[conversations.turn-emitter] prime-emit failed for ${conversationId}`,
            err,
          );
        }
      }
    }
    return;
  }

  for (const turn of endTurns) {
    if (room.emittedEndTurnIds.has(turn.messageId)) continue;
    room.emittedEndTurnIds.add(turn.messageId);
    try {
      await conversationTurnCompleted.emit({
        conversationId,
        stopReason: "end_turn",
        text: turn.text,
        messageId: turn.messageId,
      });
    } catch (err) {
      console.error(
        `[conversations.turn-emitter] emit failed for ${conversationId}`,
        err,
      );
    }
  }
}

// A durable workflow is "waiting" on this conversation iff the events plugin
// has at least one enabled trigger row keyed to it. We don't read the jobs
// plugin's _jobWaits table directly — cross-plugin internal access is banned
// and would also miss future consumers that wait on this event for non-jobs
// reasons.
async function hasPendingTrigger(conversationId: string): Promise<boolean> {
  const rows = (await db.execute(
    sql`SELECT id FROM ${_conversationTurnCompletedTriggers}
        WHERE enabled = true AND conversation_id = ${conversationId}
        LIMIT 1`,
  )) as unknown as Array<{ id: string }>;
  return rows.length > 0;
}

interface EndTurn {
  messageId: string;
  text: string;
}

// Lightweight re-parse: we only need end-turn assistant messages with a
// message.id and concatenated text. Mirrors the merging logic in
// parse-jsonl.ts without pulling in that plugin (cross-plugin internal
// imports are forbidden).
function extractEndTurns(lines: string[]): EndTurn[] {
  const byId = new Map<string, { text: string; stopReason?: string }>();

  for (const line of lines) {
    if (!line) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.type !== "assistant") continue;
    const msg = obj.message as
      | {
          role?: string;
          content?: unknown;
          id?: string;
          stop_reason?: string;
        }
      | undefined;
    if (!msg || msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
    const id = msg.id;
    if (!id) continue;

    let rec = byId.get(id);
    if (!rec) {
      rec = { text: "" };
      byId.set(id, rec);
    }
    for (const block of msg.content as Array<{ type?: string; text?: string }>) {
      if (block?.type === "text" && typeof block.text === "string") {
        rec.text += block.text;
      }
    }
    if (typeof msg.stop_reason === "string" && !rec.stopReason) {
      rec.stopReason = msg.stop_reason;
    }
  }

  const out: EndTurn[] = [];
  for (const [id, rec] of byId) {
    if (rec.stopReason === "end_turn") {
      out.push({ messageId: id, text: rec.text });
    }
  }
  return out;
}
