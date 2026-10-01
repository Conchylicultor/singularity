import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import {
  defineFileWatcher,
  type FileWatcher,
} from "@plugins/infra/plugins/file-watcher/server";
import type { EditedFile } from "../../core/protocol";
import { computeEditedFiles } from "./compute-edited-files";
import { editedFilesSignature } from "./edited-files-signature";
import { getEditedFiles } from "./get-edited-files";
import { evictEditedFiles, primeEditedFiles } from "./edited-files-cache";

// One instance per watched worktree (a room), labelled by its path. The events
// themselves are never read — any change batch triggers one recompute, batched
// for 200 ms and forced at least every 2 s while changes keep coming.
export const editedFilesWatcher = defineFileWatcher({
  name: "conversation-view.edited-files",
  description:
    "Watches an open conversation's worktree and recomputes its list of edited files when anything outside build output and dependencies changes.",
  debounceMs: 200,
  ceilingMs: 2000,
  ignore: [
    "**/.git/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/.cache/**",
    "**/coverage/**",
  ],
});

type Listener = (files: EditedFile[]) => void;

interface Room {
  worktreePath: string;
  watcher: FileWatcher | null;
  opening: Promise<void> | null;
  serialized: string;
  // null = never successfully computed. A git-failed initial load must NOT
  // manufacture an empty list here — an empty `[]` is a legitimate "no edits"
  // value a new subscriber would absorb as truth. While null, new subscribers
  // are handed nothing and fall back to the resource loader (which throws on a
  // git failure — stale-safe). Only a real successful compute sets this.
  lastFiles: EditedFile[] | null;
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
      watcher: null,
      opening: null,
      serialized: "",
      lastFiles: null,
      subscribers: new Set(),
    };
    rooms.set(worktreePath, room);
    const created = room;
    void runTracked("watch-edited-files:open", () => openRoom(created));
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
    // Initial load reads THROUGH the memo, and does NOT prime. The memo probes its
    // own content signature and caches under it, so a read-through already leaves
    // the cache correctly populated — and it keeps the embedded single-flight that
    // collapses the first-subscribe race with a concurrent resource-loader read
    // into one git batch. Direct-compute-then-prime here would double the
    // first-subscribe cost for no correctness gain.
    //
    // (`recompute` below still computes directly, because a watcher that read its
    // own cache could fan out a value it never re-derived — see there.)
    const files = await getEditedFiles(room.worktreePath);
    room.lastFiles = files;
    room.serialized = JSON.stringify(files);
    fanOut(room, files);
    // eslint-disable-next-line promise-safety/no-bare-catch
  } catch (err) {
    console.error("[watch-edited-files] initial load failed", err);
  }

  try {
    const watcher = await editedFilesWatcher.start({
      dirs: [room.worktreePath],
      label: room.worktreePath,
      onChange: () => {
        void runTracked("watch-edited-files:recompute", () => recompute(room));
      },
    });
    // The last subscriber may have left while the watch was opening: this room
    // is already closed, so nothing else would ever stop it.
    if (rooms.get(room.worktreePath) !== room) {
      await watcher.stop();
      return;
    }
    room.watcher = watcher;
    // eslint-disable-next-line promise-safety/no-bare-catch
  } catch (err) {
    console.error("[watch-edited-files] failed to open watcher", err);
  }
}

async function recompute(room: Room): Promise<void> {
  if (!rooms.has(room.worktreePath)) return;
  try {
    // Direct (un-memoized) compute: the watcher must never read its own cache. A
    // memo hit here could be ≤1 event stale (the mid-flight joiner contract), and
    // the watcher FANS THAT OUT — with no further filesystem event, nothing would
    // ever correct it.
    //
    // Ordering contract (the memo's `prime` precondition): capture the signature
    // BEFORE the compute. A change landing mid-compute then leaves the stored
    // signature older than the value it labels, so the next `get` probes a newer
    // signature, misses, and recomputes. That over-invalidates by one needless
    // recompute; it can never serve a torn value under a matching signature.
    // Capturing it after would invert the skew — the entry would claim a snapshot
    // newer than its value and every subsequent `get` would hit it.
    //
    // The prime stays BEFORE the unchanged-JSON early return, so the memo always
    // holds the freshly-confirmed list under the freshly-probed signature; the
    // early return only skips the fanOut.
    const signature = await editedFilesSignature(room.worktreePath);
    const files = await computeEditedFiles(room.worktreePath);
    const serialized = JSON.stringify(files);
    primeEditedFiles(room.worktreePath, signature, files);
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
  // Drop the memo entry on the last subscriber (pure lifecycle cleanup); a
  // re-subscribe repopulates it via openRoom's read-through. A recompute still in
  // flight across this evict is harmless: it write-backs {contentSig, value}, and
  // any later reader probes the CURRENT content signature, so a surviving entry is
  // served only if it genuinely matches git state.
  evictEditedFiles(room.worktreePath);
  if (room.watcher) {
    // eslint-disable-next-line promise-safety/no-bare-catch, detached-work-safety/no-untracked-detached-work -- trivial fire-and-forget watcher cleanup
    void room.watcher.stop().catch((err: unknown) => {
      console.error("[watch-edited-files] unsubscribe failed", err);
    });
  }
}
