import { createFileWatcher, type FileWatcher } from "@plugins/infra/plugins/file-watcher/server";
import { CLAUDE_PROJECTS_DIR } from "@plugins/infra/plugins/paths/server";
import { retryUntil, fixed } from "@plugins/packages/plugins/retry/core";
import { resolveConversationTranscriptPaths } from "./resolve-chain";
import { readJsonlEventsFromChain } from "./parse-jsonl";
import { transcriptChainSignature } from "./chain-signature";
import type { JsonlEvent } from "../../core";

/**
 * A conversation's events, together with the chain signature they were read under.
 *
 * The signature is captured BEFORE the read, so it describes a snapshot no newer
 * than `events` — `createSignedMemo.prime`'s precondition. A listener may therefore
 * prime a signed memo with the pair directly.
 */
export interface TranscriptSnapshot {
  events: JsonlEvent[];
  signature: string;
}

type Listener = (snapshot: TranscriptSnapshot) => void;

interface Room {
  conversationId: string;
  /** The conversation's session chain, oldest → newest. Grows on a session switch. */
  transcriptPaths: string[];
  /** Signature `lastEvents` was read under. `""` never matches a real one, so the first process always fans out. */
  lastSignature: string;
  lastEvents: JsonlEvent[];
  subscribers: Set<Listener>;
  abort: AbortController;
}

const rooms = new Map<string, Room>();
// Reverse index: transcript file path → conversationId, for O(1) parcel dispatch.
// Every file of a room's chain is registered — an append to an ancestor still has
// to fan out, since the rendered events are the merge of the whole chain.
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
      // Belt-and-suspenders for a missed parcel event AND for a missed
      // `refreshConversationChain` call: re-resolving here bounds the staleness of
      // a session switch to one reconcile period even if the poller never notified.
      for (const room of rooms.values()) void reconcileRoom(room);
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
      transcriptPaths: [],
      lastSignature: "",
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
    // Late subscriber: deliver current snapshot immediately. Both halves are read
    // here (and written in `processRoom`) together, so they can never be handed out
    // as a mismatched pair.
    const snapshot: TranscriptSnapshot = {
      events: room.lastEvents,
      signature: room.lastSignature,
    };
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

/**
 * Re-resolve a conversation's session chain into its live room, then re-process.
 *
 * The poller calls this the moment it records a new session id, so a subscriber
 * already watching the conversation follows the switch immediately instead of
 * staying pinned to the file the room resolved at subscribe time.
 *
 * No-op when nothing is watching that conversation: the next `watchTranscript`
 * resolves the chain from scratch.
 */
export async function refreshConversationChain(conversationId: string): Promise<void> {
  const room = rooms.get(conversationId);
  if (!room) return;
  await refreshRoom(room);
}

async function resolveRoom(room: Room): Promise<void> {
  const { signal } = room.abort;

  // `retryUntil` retries while its callback resolves null/undefined and rethrows
  // anything it throws. Map "no transcript on disk yet" (an empty chain, or a
  // recorded session Claude hasn't written a file for) onto null so the room keeps
  // waiting; a DB or glob failure still surfaces on the first attempt.
  const paths = await retryUntil(
    async () => {
      const resolved = await resolveConversationTranscriptPaths(room.conversationId);
      return resolved.length > 0 ? resolved : null;
    },
    { delay: fixed(1_000), signal },
  );

  registerPaths(room, paths);
  await processRoom(room);
}

/**
 * The reconcile sweep's per-room boundary. One room whose chain can't be resolved
 * (DB blip, glob failure) must not abort the sweep for every other room — same
 * reasoning as `processRoom`'s catch.
 */
async function reconcileRoom(room: Room): Promise<void> {
  try {
    await refreshRoom(room);
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch (err) {
    console.error(`[transcript-watcher] reconcile failed for ${room.conversationId}`, err);
  }
}

async function refreshRoom(room: Room): Promise<void> {
  if (!rooms.has(room.conversationId)) return;
  const paths = await resolveConversationTranscriptPaths(room.conversationId);
  // An empty resolution means the chain hasn't landed on disk yet (or a room whose
  // initial resolveRoom is still retrying). Keep whatever the room already had
  // rather than tearing down a working subscription.
  if (paths.length > 0) registerPaths(room, paths);
  await processRoom(room);
}

function registerPaths(room: Room, paths: string[]): void {
  for (const stale of room.transcriptPaths) {
    if (!paths.includes(stale)) pathToConvId.delete(stale);
  }
  room.transcriptPaths = paths;
  for (const path of paths) pathToConvId.set(path, room.conversationId);
}

async function processRoom(room: Room): Promise<void> {
  if (room.transcriptPaths.length === 0 || !rooms.has(room.conversationId)) return;
  try {
    // Ordering contract (the memo's `prime` precondition): capture the signature
    // BEFORE the read. A change landing mid-read then leaves the signature OLDER
    // than the events it labels, so the next `get` probes a newer signature, misses,
    // and recomputes. That over-invalidates by one needless read; it can never serve
    // a torn value under a matching signature. Capturing it after would invert the
    // skew — the pair would claim a snapshot newer than its value, and every
    // subsequent `get` would hit it.
    //
    // The signature is also the room's SOLE change-detector, replacing the old
    // per-path `Bun.file().lastModified` map. Strictly more sensitive (it also moves
    // on a size-only change and on chain growth), and over-firing is safe.
    const signature = await transcriptChainSignature(room.transcriptPaths);
    if (signature === room.lastSignature) return;
    const events = await readJsonlEventsFromChain(room.transcriptPaths);
    // Assigned together, AFTER a successful read. The old code stored the mtimes
    // before reading, so a transient read failure permanently dropped those events
    // until the next mtime change.
    room.lastEvents = events;
    room.lastSignature = signature;
    fanOut(room, { events, signature });
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch (err) {
    console.error(`[transcript-watcher] processRoom failed for ${room.conversationId}`, err);
  }
}

function fanOut(room: Room, snapshot: TranscriptSnapshot): void {
  for (const listener of room.subscribers) {
    try {
      listener(snapshot);
    // eslint-disable-next-line promise-safety/no-bare-catch
    } catch (err) {
      console.error("[transcript-watcher] listener threw", err);
    }
  }
}

function closeRoom(room: Room): void {
  room.abort.abort();
  for (const path of room.transcriptPaths) pathToConvId.delete(path);
  rooms.delete(room.conversationId);
}
