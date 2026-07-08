import type * as parcel from "@parcel/watcher";
import { getParcelWatcher } from "@plugins/infra/plugins/file-watcher/server";
import type { EditedFile } from "../../core/protocol";
import { computeEditedFiles, getEditedFiles } from "./get-edited-files";
import { evictEditedFiles, primeEditedFiles } from "./edited-files-cache";

const DEBOUNCE_MS = 200;
const CEILING_MS = 2000;

const IGNORE = [
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/.cache/**",
  "**/coverage/**",
];

type Listener = (files: EditedFile[]) => void;

interface Room {
  worktreePath: string;
  subscription: parcel.AsyncSubscription | null;
  opening: Promise<void> | null;
  serialized: string;
  // null = never successfully computed. A git-failed initial load must NOT
  // manufacture an empty list here — an empty `[]` is a legitimate "no edits"
  // value a new subscriber would absorb as truth. While null, new subscribers
  // are handed nothing and fall back to the resource loader (which throws on a
  // git failure — stale-safe). Only a real successful compute sets this.
  lastFiles: EditedFile[] | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  lastRecomputeAt: number;
  ceilingTimer: ReturnType<typeof setTimeout> | null;
  subscribers: Set<Listener>;
}

const rooms = new Map<string, Room>();

export function watchEditedFiles(
  worktreePath: string,
  onChange: Listener,
): () => void {
  let room = rooms.get(worktreePath);
  if (!room) {
    room = {
      worktreePath,
      subscription: null,
      opening: null,
      serialized: "",
      lastFiles: null,
      debounceTimer: null,
      lastRecomputeAt: 0,
      ceilingTimer: null,
      subscribers: new Set(),
    };
    rooms.set(worktreePath, room);
    void openRoom(room);
  } else if (room.lastFiles !== null) {
    // Fire the new subscriber with the last known list on next tick — but ONLY if
    // we have a real, successfully-computed list. If the room has never computed
    // (initial load failed / still in flight), we hand the new subscriber nothing;
    // the resource loader is the source of truth and throws on a git failure.
    const snapshot = room.lastFiles;
    queueMicrotask(() => {
      if (room!.subscribers.has(onChange)) onChange(snapshot);
    });
  }
  room.subscribers.add(onChange);

  return () => {
    const r = rooms.get(worktreePath);
    if (!r) return;
    r.subscribers.delete(onChange);
    if (r.subscribers.size === 0) closeRoom(r);
  };
}

async function openRoom(room: Room): Promise<void> {
  try {
    // Initial load reads THROUGH the memo: at first-subscribe the cache is empty
    // (generation 0), so this is a compute either way — but going through the memo
    // shares the embedded single-flight with a concurrent resource-loader read,
    // collapsing the first-subscribe race to one git batch. (Recompute below stays
    // on the direct compute, so the watcher never reads a stale gen-N cache.) Then
    // prime at the new generation so the loader's next read is a hit.
    const files = await getEditedFiles(room.worktreePath);
    room.lastFiles = files;
    room.serialized = JSON.stringify(files);
    room.lastRecomputeAt = Date.now();
    primeEditedFiles(room.worktreePath, files);
    fanOut(room, files);
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch (err) {
    console.error("[watch-edited-files] initial load failed", err);
  }

  try {
    const parcelWatcher = await getParcelWatcher();
    room.subscription = await parcelWatcher.subscribe(
      room.worktreePath,
      (err: Error | null) => {
        if (err) {
          console.error("[watch-edited-files] watcher error", err);
          return;
        }
        scheduleRecompute(room);
      },
      { ignore: IGNORE },
    );
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch (err) {
    console.error("[watch-edited-files] failed to open watcher", err);
  }
}

function scheduleRecompute(room: Room): void {
  if (room.debounceTimer) return;
  const since = Date.now() - room.lastRecomputeAt;
  const delay = since >= CEILING_MS ? DEBOUNCE_MS : Math.min(DEBOUNCE_MS, CEILING_MS - since);
  room.debounceTimer = setTimeout(() => {
    room.debounceTimer = null;
    void recompute(room);
  }, delay);

  // Safety ceiling: guarantee a recompute at least every CEILING_MS.
  if (!room.ceilingTimer) {
    room.ceilingTimer = setTimeout(() => {
      room.ceilingTimer = null;
      if (room.debounceTimer) {
        clearTimeout(room.debounceTimer);
        room.debounceTimer = null;
        void recompute(room);
      }
    }, CEILING_MS);
  }
}

async function recompute(room: Room): Promise<void> {
  if (!rooms.has(room.worktreePath)) return;
  room.lastRecomputeAt = Date.now();
  if (room.ceilingTimer) {
    clearTimeout(room.ceilingTimer);
    room.ceilingTimer = null;
  }
  try {
    // Direct (un-memoized) compute, then prime the memo at the new generation —
    // BEFORE the unchanged-JSON early return, so the memo always holds the
    // freshly-confirmed list at the latest generation (the loader's signature
    // tracks "number of completed watcher computes"). Returning the same files at
    // a new generation is correct, never stale; the early return only skips the
    // fanOut, not the prime.
    const files = await computeEditedFiles(room.worktreePath);
    const serialized = JSON.stringify(files);
    primeEditedFiles(room.worktreePath, files);
    if (serialized === room.serialized) return;
    room.serialized = serialized;
    room.lastFiles = files;
    fanOut(room, files);
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch (err) {
    console.error("[watch-edited-files] recompute failed", err);
  }
}

function fanOut(room: Room, files: EditedFile[]): void {
  for (const listener of room.subscribers) {
    try {
      listener(files);
    // eslint-disable-next-line promise-safety/no-bare-catch
    } catch (err) {
      console.error("[watch-edited-files] listener threw", err);
    }
  }
}

function closeRoom(room: Room): void {
  rooms.delete(room.worktreePath);
  // Drop the memo + generation entry on the last subscriber (lifecycle cleanup);
  // a re-subscribe re-primes cheaply via openRoom's compute.
  evictEditedFiles(room.worktreePath);
  if (room.debounceTimer) clearTimeout(room.debounceTimer);
  if (room.ceilingTimer) clearTimeout(room.ceilingTimer);
  if (room.subscription) {
    // eslint-disable-next-line promise-safety/no-bare-catch
    void room.subscription.unsubscribe().catch((err: unknown) => {
      console.error("[watch-edited-files] unsubscribe failed", err);
    });
  }
}
