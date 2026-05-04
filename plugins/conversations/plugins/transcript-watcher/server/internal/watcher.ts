import parcel from "@parcel/watcher";
import { CLAUDE_PROJECTS_DIR } from "@plugins/infra/plugins/paths/server";
import { getConversationClaudeSessionId } from "@plugins/tasks-core/server";
import { findTranscriptPath } from "./find-transcript-path";
import { readJsonlEvents } from "./parse-jsonl";
import type { JsonlEvent } from "../../shared";

const RECONCILE_MS = 30_000;
const PATH_RETRY_MS = 1_000;

type Listener = (events: JsonlEvent[]) => void;

interface Room {
  conversationId: string;
  claudeSessionId: string | null;
  transcriptPath: string | null;
  lastMtimeMs: number;
  lastEvents: JsonlEvent[];
  subscribers: Set<Listener>;
  pathRetryTimer: ReturnType<typeof setInterval> | null;
}

const rooms = new Map<string, Room>();
// Reverse index: transcript file path → conversationId, for O(1) parcel dispatch.
const pathToConvId = new Map<string, string>();

let subscription: parcel.AsyncSubscription | null = null;
let reconcileTimer: ReturnType<typeof setInterval> | null = null;

export async function startTranscriptWatcher(): Promise<void> {
  try {
    subscription = await parcel.subscribe(
      CLAUDE_PROJECTS_DIR,
      (err, events) => {
        if (err) {
          console.error("[transcript-watcher] watcher error", err);
          return;
        }
        for (const ev of events) {
          if (!ev.path.endsWith(".jsonl")) continue;
          const convId = pathToConvId.get(ev.path);
          if (!convId) continue;
          const room = rooms.get(convId);
          if (room) void processRoom(room);
        }
      },
    );
  } catch (err) {
    console.error("[transcript-watcher] failed to open parcel subscription", err);
  }

  reconcileTimer = setInterval(() => {
    for (const room of rooms.values()) {
      if (room.transcriptPath) void processRoom(room);
    }
  }, RECONCILE_MS);
}

export async function stopTranscriptWatcher(): Promise<void> {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
  for (const room of rooms.values()) {
    if (room.pathRetryTimer) clearInterval(room.pathRetryTimer);
  }
  rooms.clear();
  pathToConvId.clear();
  if (subscription) {
    await subscription.unsubscribe().catch((err) =>
      console.error("[transcript-watcher] unsubscribe failed", err),
    );
    subscription = null;
  }
}

export function watchTranscript(
  conversationId: string,
  onChange: Listener,
): () => void {
  let room = rooms.get(conversationId);
  if (!room) {
    room = {
      conversationId,
      claudeSessionId: null,
      transcriptPath: null,
      lastMtimeMs: 0,
      lastEvents: [],
      subscribers: new Set(),
      pathRetryTimer: null,
    };
    rooms.set(conversationId, room);
    void seedRoom(room);
  } else if (room.lastEvents.length > 0) {
    // Late subscriber: deliver current snapshot immediately.
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

async function seedRoom(room: Room): Promise<void> {
  if (!rooms.has(room.conversationId)) return;
  try {
    if (!room.claudeSessionId) {
      const sid = await getConversationClaudeSessionId(room.conversationId);
      if (sid === undefined || !sid) return;
      room.claudeSessionId = sid;
    }
    const path = await findTranscriptPath(room.claudeSessionId);
    if (!path) {
      // Transcript file not yet written — poll until it appears.
      if (!room.pathRetryTimer) {
        room.pathRetryTimer = setInterval(() => void retryPath(room), PATH_RETRY_MS);
      }
      return;
    }
    registerPath(room, path);
    await processRoom(room);
  } catch (err) {
    console.error(`[transcript-watcher] seedRoom failed for ${room.conversationId}`, err);
  }
}

async function retryPath(room: Room): Promise<void> {
  if (!rooms.has(room.conversationId) || !room.claudeSessionId) return;
  try {
    const path = await findTranscriptPath(room.claudeSessionId);
    if (!path) return;
    if (room.pathRetryTimer) {
      clearInterval(room.pathRetryTimer);
      room.pathRetryTimer = null;
    }
    registerPath(room, path);
    await processRoom(room);
  } catch (err) {
    console.error(`[transcript-watcher] retryPath failed for ${room.conversationId}`, err);
  }
}

function registerPath(room: Room, path: string): void {
  room.transcriptPath = path;
  pathToConvId.set(path, room.conversationId);
}

async function processRoom(room: Room): Promise<void> {
  if (!room.transcriptPath || !rooms.has(room.conversationId)) return;
  try {
    const file = Bun.file(room.transcriptPath);
    if (!(await file.exists())) return;
    const mtime = file.lastModified;
    if (mtime === room.lastMtimeMs) return;
    room.lastMtimeMs = mtime;
    const events = await readJsonlEvents(room.transcriptPath);
    room.lastEvents = events;
    fanOut(room, events);
  } catch (err) {
    console.error(`[transcript-watcher] processRoom failed for ${room.conversationId}`, err);
  }
}

function fanOut(room: Room, events: JsonlEvent[]): void {
  for (const listener of room.subscribers) {
    try {
      listener(events);
    } catch (err) {
      console.error("[transcript-watcher] listener threw", err);
    }
  }
}

function closeRoom(room: Room): void {
  if (room.pathRetryTimer) {
    clearInterval(room.pathRetryTimer);
    room.pathRetryTimer = null;
  }
  if (room.transcriptPath) pathToConvId.delete(room.transcriptPath);
  rooms.delete(room.conversationId);
}
