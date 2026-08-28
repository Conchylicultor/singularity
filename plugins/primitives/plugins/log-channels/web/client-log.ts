import {
  EndpointError,
  fetchEndpoint,
} from "@plugins/infra/plugins/endpoints/web";
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
  /**
   * Set ONLY on the synthetic drop marker, carrying how many real lines it stands
   * for. Lets a later drop that swallows the marker fold its count forward instead
   * of restarting the tally, and keeps the marker out of the wire shape (see
   * `toWire`).
   */
  dropped?: number;
}

const buffer = new Map<string, BufferedLine[]>();
const FLUSH_DELAY_MS = 250;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Per-channel buffer cap. The buffer used to be unbounded, so a long backend
 * outage (or a duress episode, during which the server answers 429) plus a chatty
 * tab grew browser memory without limit — and one-instance-per-user means that is
 * the same host that is already in trouble.
 */
const MAX_BUFFERED_LINES = 4_000;

/** Backoff after a failed flush, and the longer one the server's 429 asks for. */
const RETRY_DELAY_MS = 5_000;
const BACKPRESSURE_RETRY_DELAY_MS = 30_000;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

export function clientLog(
  channel: string,
  line: string,
  stream?: LogStream,
): void {
  let lines = buffer.get(channel);
  if (!lines) {
    lines = [];
    buffer.set(channel, lines);
  }
  lines.push({ line, stream, t: Date.now() });
  capBuffer(lines);
  scheduleFlush();
}

/**
 * Enforce the cap by dropping the OLDEST lines — deliberately the opposite of the
 * server-side duress shed buffer's drop-newest. That buffer can afford to keep the
 * head because it has a first-N-durable guarantee at episode onset; the browser has
 * no such thing, and its newest lines describe the problem the user is looking at
 * right now. The loss is never silent: one marker line takes the head slot (which is
 * why the reserve below is `MAX_BUFFERED_LINES - 1`), and a marker swallowed by a
 * later drop hands its own count forward, so the tally is cumulative.
 */
function capBuffer(lines: BufferedLine[]): void {
  if (lines.length <= MAX_BUFFERED_LINES) return;
  const removed = lines.splice(0, lines.length - (MAX_BUFFERED_LINES - 1));
  let dropped = 0;
  for (const r of removed) dropped += r.dropped ?? 1;
  lines.unshift({
    line: `[clientLog] dropped ${dropped} lines under backpressure`,
    stream: "stderr",
    t: Date.now(),
    dropped,
  });
}

/** The emit wire shape — drops the marker's internal `dropped` bookkeeping. */
function toWire(l: BufferedLine): {
  line: string;
  stream?: LogStream;
  t: number;
} {
  return { line: l.line, stream: l.stream, t: l.t };
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  // Single trailing debounce timer — not a poll loop. Cleared once it fires.
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_DELAY_MS);
}

/**
 * Arm ONE retry after a failed flush. This is a timer on a FAILURE EDGE, not a
 * poll loop: nothing is ever scheduled while flushes succeed, and the timer clears
 * itself the moment it fires. It exists because the other two retry triggers are
 * both events that may never come — a later `clientLog` call and a WS reconnect —
 * so a tab that goes quiet right after a rejection would otherwise strand its
 * buffered lines until the next page load.
 */
function scheduleRetry(delayMs: number): void {
  if (retryTimer !== null) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flush();
  }, delayMs);
}

async function flush(): Promise<void> {
  let retryDelayMs: number | null = null;
  for (const [channel, lines] of buffer) {
    // Drain this channel in batches the server will accept (≤ MAX_EMIT_LINES).
    // A single over-cap POST would be rejected with 400 on every retry forever,
    // so the chunk size — not the accumulated buffer length — bounds each request.
    while (lines.length > 0) {
      const drained = lines.splice(0, MAX_EMIT_LINES);
      try {
        await fetchEndpoint(
          emitLogs,
          {},
          { body: { channel, lines: drained.map(toWire) } },
        );
      } catch (err) {
        // Deliberate, self-correcting re-queue: the backend may be mid-restart
        // (the `./singularity build` case) or refusing ingress while the host is
        // under duress (429). Put the lines back, preserving order ahead of
        // anything newly buffered, and retry.
        lines.unshift(...drained);
        // Surface the failure for visibility without breaking the retry loop.
        if (err instanceof Error) {
          // A 429 is the server saying "stop, the box is on fire" — back off far
          // harder than for a plain restart, which resolves in seconds.
          const backpressure =
            err instanceof EndpointError && err.status === 429;
          retryDelayMs = Math.max(
            retryDelayMs ?? 0,
            backpressure ? BACKPRESSURE_RETRY_DELAY_MS : RETRY_DELAY_MS,
          );
          console.debug("[clientLog] flush failed, will retry:", err.message);
          break; // Stop draining this channel; retry the rest on the next flush.
        } else {
          throw err;
        }
      }
    }
  }
  if (retryDelayMs !== null) scheduleRetry(retryDelayMs);
}

// Reconnect flush: when the worktree WS channel comes back up after the backend
// restart, drain anything buffered during the downtime. The worktree
// notifications channel publishes on this global bus via SharedWebSocket.
subscribeWsStatus((ev) => {
  if (ev.status === "open") void flush();
});
