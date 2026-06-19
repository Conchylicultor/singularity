// Wraps a producer into a streaming NDJSON (application/x-ndjson) Response.
// The producer emits frames; an unexpected throw is framed as {"error": message};
// the stream always closes. Uses only universal Web APIs so it stays legal in
// shared/ (no web/ or server/ imports).
export function ndjsonResponse(
  produce: (emit: (frame: object) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (frame: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(frame) + "\n"));
      try {
        await produce(emit);
      } catch (e) {
        emit({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
