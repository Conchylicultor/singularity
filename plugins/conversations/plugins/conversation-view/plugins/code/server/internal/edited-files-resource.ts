import { defineResource } from "../../../../../../../../server/src/resources";
import { worktreePathForSync } from "../../../../../../server/internal/worktree";
import { getEditedFiles } from "./get-edited-files";

const TICK_MS = 1000;

interface Room {
  timer: ReturnType<typeof setInterval> | null;
  lastSerialized: string;
}

const rooms = new Map<string, Room>();

type Params = { id: string };

export const editedFilesResource = defineResource({
  key: "edited-files",
  mode: "invalidate",
  loader: async ({ id }: Params) => getEditedFiles(worktreePathForSync(id)),
  async onFirstSubscribe({ id }: Params) {
    if (rooms.has(id)) return;
    const worktreePath = worktreePathForSync(id);
    let lastSerialized = "";
    try {
      lastSerialized = JSON.stringify(await getEditedFiles(worktreePath));
    } catch (err) {
      console.error("[edited-files] initial load failed", err);
    }
    const room: Room = { timer: null, lastSerialized };
    rooms.set(id, room);
    room.timer = setInterval(() => {
      void tick(id);
    }, TICK_MS);
  },
  onLastUnsubscribe({ id }: Params) {
    const room = rooms.get(id);
    if (!room) return;
    if (room.timer) clearInterval(room.timer);
    rooms.delete(id);
  },
});

async function tick(id: string): Promise<void> {
  const room = rooms.get(id);
  if (!room) return;
  try {
    const files = await getEditedFiles(worktreePathForSync(id));
    const serialized = JSON.stringify(files);
    if (serialized === room.lastSerialized) return;
    room.lastSerialized = serialized;
    editedFilesResource.notify({ id });
  } catch (err) {
    console.error("[edited-files] tick failed", err);
  }
}
