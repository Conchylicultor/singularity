import { eq } from "drizzle-orm";
import { db } from "../../../../../../../../server/src/db/client";
import { conversations } from "../../../../../../server/schema";
import { getEditedFiles } from "./get-edited-files";
import type { EditedFile, EditedFilesResponse } from "../../shared/protocol";

const TICK_MS = 1000;
const encoder = new TextEncoder();

interface Room {
  worktreePath: string;
  subscribers: Set<ReadableStreamDefaultController<Uint8Array>>;
  timer: ReturnType<typeof setInterval> | null;
  lastSerialized: string;
}

const rooms = new Map<string, Room>();

function frame(files: EditedFile[]): Uint8Array {
  const body: EditedFilesResponse = { files };
  return encoder.encode(`data: ${JSON.stringify(body)}\n\n`);
}

async function tick(id: string, room: Room): Promise<void> {
  const files = await getEditedFiles(room.worktreePath);
  const serialized = JSON.stringify(files);
  if (serialized === room.lastSerialized) return;
  room.lastSerialized = serialized;
  const bytes = frame(files);
  for (const controller of room.subscribers) {
    try {
      controller.enqueue(bytes);
    } catch {
      room.subscribers.delete(controller);
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

export async function handleEditedFilesStream(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });

  const [row] = await db
    .select({ worktreePath: conversations.worktreePath })
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  if (!row) return new Response("Not found", { status: 404 });

  const worktreePath = row.worktreePath;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(": ok\n\n"));

      let room = rooms.get(id);
      if (!room) {
        room = {
          worktreePath,
          subscribers: new Set(),
          timer: null,
          lastSerialized: "",
        };
        rooms.set(id, room);
      }
      room.subscribers.add(controller);

      // Send current snapshot immediately so a new subscriber doesn't wait a tick.
      try {
        const files = await getEditedFiles(worktreePath);
        room.lastSerialized = JSON.stringify(files);
        controller.enqueue(frame(files));
      } catch (err) {
        console.error("[code.edited-files-stream] snapshot failed", err);
      }

      startRoom(room, id);
    },
    cancel(controller) {
      const room = rooms.get(id);
      if (!room) return;
      room.subscribers.delete(controller);
      if (room.subscribers.size === 0) stopRoom(id);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
    },
  });
}
