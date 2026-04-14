import type { ConversationEvent } from "../../shared/protocol";
import { getSnapshot } from "./poller";

const subscribers = new Set<ReadableStreamDefaultController<Uint8Array>>();
const encoder = new TextEncoder();
const PING = encoder.encode(": ping\n\n");
const HEARTBEAT_MS = 20_000;

function frame(event: ConversationEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export function broadcast(event: ConversationEvent): void {
  const bytes = frame(event);
  for (const controller of subscribers) {
    try {
      controller.enqueue(bytes);
    } catch {
      subscribers.delete(controller);
    }
  }
}

setInterval(() => {
  for (const controller of subscribers) {
    try {
      controller.enqueue(PING);
    } catch {
      subscribers.delete(controller);
    }
  }
}, HEARTBEAT_MS);

export function handleStream(_req: Request): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      subscribers.add(controller);
      controller.enqueue(encoder.encode(": ok\n\n"));
      for (const [id, info] of getSnapshot()) {
        controller.enqueue(
          frame({ type: "working", id, working: info.working }),
        );
      }
    },
    cancel(controller) {
      subscribers.delete(controller);
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
