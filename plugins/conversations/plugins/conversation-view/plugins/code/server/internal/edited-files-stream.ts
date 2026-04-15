import type { SseHandler } from "../../../../../../../../server/src/types";
import { worktreePathForSync } from "../../../../../../server/internal/worktree";
import { getEditedFiles } from "./get-edited-files";
import type { EditedFilesResponse } from "../../shared/protocol";

const TICK_MS = 1000;

type Send = (data: EditedFilesResponse) => void;

interface Room {
  worktreePath: string;
  subscribers: Set<Send>;
  timer: ReturnType<typeof setInterval> | null;
  lastSerialized: string;
}

const rooms = new Map<string, Room>();

async function tick(id: string, room: Room): Promise<void> {
  const files = await getEditedFiles(room.worktreePath);
  const serialized = JSON.stringify(files);
  if (serialized === room.lastSerialized) return;
  room.lastSerialized = serialized;
  const payload: EditedFilesResponse = { files };
  for (const send of room.subscribers) {
    try {
      send(payload);
    } catch {
      room.subscribers.delete(send);
    }
  }
  if (room.subscribers.size === 0) stopRoom(id);
}

function startRoom(room: Room, id: string) {
  if (room.timer) return;
  room.timer = setInterval(() => {
    tick(id, room).catch((err) =>
      console.error("[code.edited-files-stream] tick failed", err),
    );
  }, TICK_MS);
}

function stopRoom(id: string) {
  const room = rooms.get(id);
  if (!room) return;
  if (room.timer) clearInterval(room.timer);
  rooms.delete(id);
}

export const editedFilesStreamHandler: SseHandler<EditedFilesResponse> = {
  subscribe(send, params) {
    const id = params.id;
    if (!id) return () => {};
    const worktreePath = worktreePathForSync(id);

    let room = rooms.get(id);
    const fresh = !room;
    if (!room) {
      room = {
        worktreePath,
        subscribers: new Set(),
        timer: null,
        lastSerialized: "",
      };
      rooms.set(id, room);
    }
    room.subscribers.add(send);

    if (room.lastSerialized) {
      try {
        send(JSON.parse(room.lastSerialized) as EditedFilesResponse);
      } catch {}
    } else if (fresh) {
      // Fire an eager first tick so the first subscriber doesn't wait TICK_MS
      // for the initial snapshot. Deferred via microtask so subscribe stays
      // fully synchronous.
      const r = room;
      queueMicrotask(() =>
        tick(id, r).catch((err) =>
          console.error("[code.edited-files-stream] initial tick failed", err),
        ),
      );
    }

    startRoom(room, id);

    return () => {
      const r = rooms.get(id);
      if (!r) return;
      r.subscribers.delete(send);
      if (r.subscribers.size === 0) stopRoom(id);
    };
  },
};
