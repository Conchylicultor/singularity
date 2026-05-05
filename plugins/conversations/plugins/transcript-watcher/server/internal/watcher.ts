import parcel from "@parcel/watcher";
import { CLAUDE_PROJECTS_DIR } from "@plugins/infra/plugins/paths/server";
import { getConversationClaudeSessionId } from "@plugins/tasks-core/server";
import { findTranscriptPath } from "./find-transcript-path";
import { readJsonlEvents } from "./parse-jsonl";
import type { JsonlEvent } from "../../shared";

const RECONCILE_MS = 30_000;
const POLL_MS = 1_000;

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

let subscription: parcel.AsyncSubscription | null = null;
let reconcileTimer: ReturnType<typeof setInterval> | null = null;

async function pollUntil<T>(
  fn: () => Promise<T | null | undefined>,
  opts: { intervalMs: number; signal: AbortSignal },
): Promise<T> {
  while (!opts.signal.aborted) {
    const result = await fn();
    if (result != null) return result;
    await Bun.sleep(opts.intervalMs);
  }
  throw new DOMException("Aborted", "AbortError");
}

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
    room.abort.abort();
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

  const sessionId = await pollUntil(
    () => getConversationClaudeSessionId(room.conversationId),
    { intervalMs: POLL_MS, signal },
  );

  const path = await pollUntil(
    () => findTranscriptPath(sessionId),
    { intervalMs: POLL_MS, signal },
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
  room.abort.abort();
  if (room.transcriptPath) pathToConvId.delete(room.transcriptPath);
  rooms.delete(room.conversationId);
}
