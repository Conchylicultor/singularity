import parcel from "@parcel/watcher";
import type { EditedFile } from "../../core/protocol";
import { getEditedFiles } from "./get-edited-files";

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
  lastFiles: EditedFile[];
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
      lastFiles: [],
      debounceTimer: null,
      lastRecomputeAt: 0,
      ceilingTimer: null,
      subscribers: new Set(),
    };
    rooms.set(worktreePath, room);
    void openRoom(room);
  } else {
    // Fire the new subscriber with the last known list on next tick.
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
    const files = await getEditedFiles(room.worktreePath);
    room.lastFiles = files;
    room.serialized = JSON.stringify(files);
    room.lastRecomputeAt = Date.now();
    fanOut(room, files);
  } catch (err) {
    console.error("[watch-edited-files] initial load failed", err);
  }

  try {
    room.subscription = await parcel.subscribe(
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
    const files = await getEditedFiles(room.worktreePath);
    const serialized = JSON.stringify(files);
    if (serialized === room.serialized) return;
    room.serialized = serialized;
    room.lastFiles = files;
    fanOut(room, files);
  } catch (err) {
    console.error("[watch-edited-files] recompute failed", err);
  }
}

function fanOut(room: Room, files: EditedFile[]): void {
  for (const listener of room.subscribers) {
    try {
      listener(files);
    } catch (err) {
      console.error("[watch-edited-files] listener threw", err);
    }
  }
}

function closeRoom(room: Room): void {
  rooms.delete(room.worktreePath);
  if (room.debounceTimer) clearTimeout(room.debounceTimer);
  if (room.ceilingTimer) clearTimeout(room.ceilingTimer);
  if (room.subscription) {
    void room.subscription.unsubscribe().catch((err: unknown) => {
      console.error("[watch-edited-files] unsubscribe failed", err);
    });
  }
}
