const subscribers = new Set<ReadableStreamDefaultController<Uint8Array>>();
const encoder = new TextEncoder();
const PING = encoder.encode(": ping\n\n");
const CHANGED = encoder.encode(`data: ${JSON.stringify({ type: "changed" })}\n\n`);
const HEARTBEAT_MS = 20_000;

export function broadcastChanged(): void {
  for (const controller of subscribers) {
    try {
      controller.enqueue(CHANGED);
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
