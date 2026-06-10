import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { subscribeWsStatus } from "@plugins/primitives/plugins/networking/web";
import { emitLogs, MAX_EMIT_LINES } from "../core/endpoints";

// Browser console.log-style logging that persists to a per-worktree JSONL file
// the agent can read with `tail`/`cat` — no browser/Playwright needed. Lines are
// buffered per channel and flushed (debounced) to POST /api/logs/emit, which
// appends them to the per-worktree logs directory (see persist.ts / logs CLAUDE.md).

type LogStream = "stdout" | "stderr";
interface BufferedLine {
  line: string;
  stream?: LogStream;
  t: number;
}

const buffer = new Map<string, BufferedLine[]>();
const FLUSH_DELAY_MS = 250;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function clientLog(channel: string, line: string, stream?: LogStream): void {
  let lines = buffer.get(channel);
  if (!lines) {
    lines = [];
    buffer.set(channel, lines);
  }
  lines.push({ line, stream, t: Date.now() });
  scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  // Single trailing debounce timer — not a poll loop. Cleared once it fires.
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_DELAY_MS);
}

async function flush(): Promise<void> {
  for (const [channel, lines] of buffer) {
    // Drain this channel in batches the server will accept (≤ MAX_EMIT_LINES).
    // A single over-cap POST would be rejected with 400 on every retry forever,
    // so the chunk size — not the accumulated buffer length — bounds each request.
    while (lines.length > 0) {
      const drained = lines.splice(0, MAX_EMIT_LINES);
      try {
        await fetchEndpoint(emitLogs, {}, { body: { channel, lines: drained } });
      } catch (err) {
        // Deliberate, self-correcting re-queue: the backend may be mid-restart
        // (the `./singularity build` case). Put the lines back, preserving order
        // ahead of anything newly buffered, and let reconnect-flush retry.
        lines.unshift(...drained);
        // Surface the failure for visibility without breaking the retry loop.
        if (err instanceof Error) {
          console.debug("[clientLog] flush failed, will retry on reconnect:", err.message);
          break; // Stop draining this channel; retry the rest on the next flush.
        } else {
          throw err;
        }
      }
    }
  }
}

// Reconnect flush: when the worktree WS channel comes back up after the backend
// restart, drain anything buffered during the downtime. The worktree
// notifications channel publishes on this global bus via SharedWebSocket.
subscribeWsStatus((ev) => {
  if (ev.status === "open") void flush();
});
