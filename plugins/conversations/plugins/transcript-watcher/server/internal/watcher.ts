import { createFileWatcher, type FileWatcher } from "@plugins/infra/plugins/file-watcher/server";
import { CLAUDE_PROJECTS_DIR } from "@plugins/infra/plugins/paths/server";
import { retryUntil, fixed } from "@plugins/packages/plugins/retry/core";
import { getConversationClaudeSessionId } from "@plugins/tasks/plugins/tasks-core/server";
import { findTranscriptPath } from "./find-transcript-path";
import { readJsonlEvents } from "./parse-jsonl";
import type { JsonlEvent } from "../../core";

type Listener = (events: JsonlEvent[]) => void;

interface Room {
  conversationId: string;
  transcriptPath: string | null;
  lastMtimeMs: number;
  lastEvents: JsonlEvent[];
  subscribers: Set<Listener>;
  abort: AbortController;
}

const rooms = new Map<string, Room>();
// Reverse index: transcript file path → conversationId, for O(1) parcel dispatch.
const pathToConvId = new Map<string, string>();

let watcher: FileWatcher | null = null;

export async function startTranscriptWatcher(): Promise<void> {
  watcher = await createFileWatcher({
    dirs: [CLAUDE_PROJECTS_DIR],
    onChange: (events) => {
      for (const ev of events) {
        const convId = pathToConvId.get(ev.path);
        if (!convId) continue;
        const room = rooms.get(convId);
        if (room) void processRoom(room);
      }
    },
    onReconcile: () => {
      for (const room of rooms.values()) {
        if (room.transcriptPath) void processRoom(room);
      }
    },
    extensions: [".jsonl"],
    debounceMs: 0,
  });
}

export async function stopTranscriptWatcher(): Promise<void> {
  for (const room of rooms.values()) {
    room.abort.abort();
  }
  rooms.clear();
  pathToConvId.clear();
  if (watcher) { await watcher.stop(); watcher = null; }
}

export function watchTranscript(
  conversationId: string,
  onChange: Listener,
): () => void {
  let room = rooms.get(conversationId);
  if (!room) {
    room = {
      conversationId,
      transcriptPath: null,
      lastMtimeMs: 0,
      lastEvents: [],
      subscribers: new Set(),
      abort: new AbortController(),
    };
    rooms.set(conversationId, room);
    void resolveRoom(room).catch((err) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(
        `[transcript-watcher] resolveRoom failed for ${conversationId}`,
        err,
      );
    });
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

async function resolveRoom(room: Room): Promise<void> {
  const { signal } = room.abort;

  const sessionId = await retryUntil(
    () => getConversationClaudeSessionId(room.conversationId),
    { delay: fixed(1_000), signal },
  );

  const path = await retryUntil(
    () => findTranscriptPath(sessionId),
    { delay: fixed(1_000), signal },
  );

  registerPath(room, path);
  await processRoom(room);
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
    const events = await readJsonlEvents(room.transcriptPath);
    room.lastMtimeMs = Math.max(mtime, room.lastMtimeMs);
    room.lastEvents = events;
    fanOut(room, events);
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch (err) {
    console.error(`[transcript-watcher] processRoom failed for ${room.conversationId}`, err);
  }
}

function fanOut(room: Room, events: JsonlEvent[]): void {
  for (const listener of room.subscribers) {
    try {
      listener(events);
    // eslint-disable-next-line promise-safety/no-bare-catch
    } catch (err) {
      console.error("[transcript-watcher] listener threw", err);
    }
  }
}

function closeRoom(room: Room): void {
  room.abort.abort();
  if (room.transcriptPath) pathToConvId.delete(room.transcriptPath);
  rooms.delete(room.conversationId);
}
