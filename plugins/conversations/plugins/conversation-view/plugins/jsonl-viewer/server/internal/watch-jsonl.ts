import type { JsonlEvent } from "../../shared";
import { findTranscriptPath } from "@plugins/conversations/server";
import { getConversationClaudeSessionId } from "@plugins/tasks-core/server";
import { readJsonlEvents } from "./parse-jsonl";

const POLL_MS = 500;

type Listener = (events: JsonlEvent[]) => void;

interface Room {
  conversationId: string;
  timer: ReturnType<typeof setInterval> | null;
  claudeSessionId: string | null;
  transcriptPath: string | null;
  lastMtimeMs: number;
  lastEvents: JsonlEvent[];
  subscribers: Set<Listener>;
}

const rooms = new Map<string, Room>();

export function watchJsonl(
  conversationId: string,
  onChange: Listener,
): () => void {
  let room = rooms.get(conversationId);
  if (!room) {
    room = {
      conversationId,
      timer: null,
      claudeSessionId: null,
      transcriptPath: null,
      lastMtimeMs: 0,
      lastEvents: [],
      subscribers: new Set(),
    };
    rooms.set(conversationId, room);
    void pollOnce(room);
    room.timer = setInterval(() => void pollOnce(room!), POLL_MS);
  } else {
    const snapshot = room.lastEvents;
    queueMicrotask(() => {
      if (room!.subscribers.has(onChange)) onChange(snapshot);
    });
  }
  room.subscribers.add(onChange);

  return () => {
    const r = rooms.get(conversationId);
    if (!r) return;
    r.subscribers.delete(onChange);
    if (r.subscribers.size === 0) closeRoom(r);
  };
}

async function pollOnce(room: Room): Promise<void> {
  if (!rooms.has(room.conversationId)) return;

  try {
    if (room.claudeSessionId === null) {
      const sid = await getConversationClaudeSessionId(room.conversationId);
      if (sid === undefined) return;
      if (sid) room.claudeSessionId = sid;
      else return;
    }
    if (!room.transcriptPath) {
      const path = await findTranscriptPath(room.claudeSessionId!);
      if (!path) return;
      room.transcriptPath = path;
    }

    const file = Bun.file(room.transcriptPath);
    if (!(await file.exists())) return;
    const mtime = file.lastModified;
    if (mtime === room.lastMtimeMs) return;
    room.lastMtimeMs = mtime;

    const events = await readJsonlEvents(room.transcriptPath);
    room.lastEvents = events;
    fanOut(room, events);
  } catch (err) {
    console.error("[watch-jsonl] poll failed", err);
  }
}

function fanOut(room: Room, events: JsonlEvent[]): void {
  for (const listener of room.subscribers) {
    try {
      listener(events);
    } catch (err) {
      console.error("[watch-jsonl] listener threw", err);
    }
  }
}

function closeRoom(room: Room): void {
  rooms.delete(room.conversationId);
  if (room.timer) clearInterval(room.timer);
}
