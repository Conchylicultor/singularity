import { publishWsStatus, type WsStatus } from "./ws-status-bus";
import { publishNetDiag } from "./net-diag-bus";
import { CrossTabElection } from "./cross-tab-election";
import type {
  WebSocketLike,
  MakeWebSocket,
  MakeBroadcastChannel,
  LockManagerLike,
} from "./transport-types";

/**
 * Injection seam for the three OS globals this stack touches. All optional —
 * production passes nothing and the globals are used; tests wire the fakes from
 * `./test-support`. `heartbeatMs`/`timeoutMs` scale the election timers down for
 * fake-timer tests. See
 * `research/2026-07-03-global-live-state-client-transport-harness.md`.
 */
export interface SharedWebSocketHooks {
  makeWebSocket?: MakeWebSocket;
  makeBroadcastChannel?: MakeBroadcastChannel;
  locks?: LockManagerLike | null;
  heartbeatMs?: number;
  timeoutMs?: number;
}

// Drop-in replacement for the string-message subset of the native WebSocket
// API, shared across all tabs of the same origin via CrossTabElection. One tab
// is elected leader and owns the real socket; others send/receive through the
// leader transparently. On leader failure (tab frozen/closed), a follower
// takes over within ~12 seconds.

const BACKOFF_MS = [500, 1000, 2000, 5000];

type WsRelayMsg =
  | { kind: "rx"; data: string }
  | { kind: "tx"; data: string }
  | { kind: "open" }
  | { kind: "close" };

export class SharedWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState: number = SharedWebSocket.CONNECTING;

  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent<string>) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  private election: CrossTabElection<WsRelayMsg>;
  private makeWebSocket: MakeWebSocket;
  private ws: WebSocketLike | null = null;
  private queue: string[] = [];
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private lastStatus: WsStatus | null = null;

  constructor(url: string | URL, hooks?: SharedWebSocketHooks) {
    this.url = typeof url === "string" ? url : url.toString();
    this.makeWebSocket = hooks?.makeWebSocket ?? ((u) => new WebSocket(u));
    const name = `singularity:shared-ws:${this.url}`;

    // Forward only the election-relevant hooks that are actually present, so an
    // omitted key keeps its "use the global default" meaning inside the election
    // (`locks: null` is a real value — explicitly absent — and must forward).
    const electionOpts: {
      heartbeatMs?: number;
      timeoutMs?: number;
      makeBroadcastChannel?: MakeBroadcastChannel;
      locks?: LockManagerLike | null;
    } = {};
    if (hooks?.heartbeatMs !== undefined) electionOpts.heartbeatMs = hooks.heartbeatMs;
    if (hooks?.timeoutMs !== undefined) electionOpts.timeoutMs = hooks.timeoutMs;
    if (hooks?.makeBroadcastChannel !== undefined) {
      electionOpts.makeBroadcastChannel = hooks.makeBroadcastChannel;
    }
    if (hooks?.locks !== undefined) electionOpts.locks = hooks.locks;

    this.election = new CrossTabElection<WsRelayMsg>(name, {
      onElected: () => this.startLeading(),
      onDemoted: () => this.onDemoted(),
      onFollowerMessage: (msg) => {
        if (msg.kind === "tx") this.writeOrQueue(msg.data);
      },
      onLeaderMessage: (msg) => {
        switch (msg.kind) {
          case "rx":
            this.dispatchMessage(msg.data);
            break;
          case "open": {
            // The leader rebroadcasts "open" to ALL followers whenever a new tab
            // joins (onFollowerJoined below). A follower already at OPEN must
            // NOT re-dispatch onopen: consumers treat onopen as "fresh
            // connection, replay state" (NotificationsClient replays its whole
            // sub set), so an unconditional dispatch made every existing tab
            // re-replay on every tab join. A genuine reconnect still
            // dispatches, because the leader's "close" broadcast reset this
            // follower to CONNECTING first.
            const wasOpen = this.readyState === SharedWebSocket.OPEN;
            this.readyState = SharedWebSocket.OPEN;
            this.setStatus("open");
            publishNetDiag({ type: "ws-open", url: this.url });
            if (!wasOpen) this.dispatchOpen();
            break;
          }
          case "close":
            this.readyState = SharedWebSocket.CONNECTING;
            this.setStatus("reconnecting");
            publishNetDiag({ type: "ws-close", url: this.url });
            break;
          case "tx":
            break;
        }
      },
      onFollowerJoined: () => {
        if (this.ws?.readyState === SharedWebSocket.OPEN) {
          this.election.broadcast({ kind: "open" });
        }
      },
    }, electionOpts);
  }

  /**
   * This tab was demoted (its leader lock was stolen by a follower that saw it go
   * silent). It no longer owns the real socket — the new leader does — so drop
   * ours and reset to a follower-waiting state. Deliberately does NOT schedule a
   * reconnect: as a follower we now receive frames relayed by the leader, and if
   * we are ever re-elected `onElected` → `startLeading` opens a fresh socket.
   */
  private onDemoted(): void {
    this.teardownWs();
    this.readyState = SharedWebSocket.CONNECTING;
    this.setStatus("reconnecting");
  }

  send(data: string): void {
    if (this.closed) return;
    if (this.election.isLeader) {
      this.writeOrQueue(data);
    } else {
      this.election.sendToLeader({ kind: "tx", data });
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = SharedWebSocket.CLOSED;
    this.teardownWs();
    this.election.close();
    try {
      this.onclose?.(new CloseEvent("close", { code: 1000, reason: "handle closed", wasClean: true }));
    // eslint-disable-next-line promise-safety/no-bare-catch
    } catch { /* ignore */ }
  }

  // --- leader: WebSocket management -----------------------------------------

  private startLeading(): void {
    if (this.closed) return;
    this.teardownWs();
    this.attempt = 0;
    this.setStatus("connecting");
    this.connectWs();
  }

  private connectWs = (): void => {
    if (this.closed) return;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    const proto =
      typeof location !== "undefined" && location.protocol === "https:" ? "wss" : "ws";
    const host = typeof location !== "undefined" ? location.host : "";
    const absUrl = /^wss?:\/\//i.test(this.url)
      ? this.url
      : `${proto}://${host}${this.url}`;

    let ws: WebSocketLike;
    try {
      ws = this.makeWebSocket(absUrl);
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.readyState = SharedWebSocket.OPEN;
      while (this.queue.length > 0) {
        const msg = this.queue.shift()!;
        // eslint-disable-next-line promise-safety/no-bare-catch
        try { ws.send(msg); } catch { /* ignore */ }
      }
      this.setStatus("open");
      publishNetDiag({ type: "ws-open", url: this.url });
      this.election.broadcast({ kind: "open" });
      this.dispatchOpen();
    };

    ws.onmessage = (ev) => {
      const data = typeof ev.data === "string" ? ev.data : "";
      this.election.broadcast({ kind: "rx", data });
      this.dispatchMessage(data);
    };

    ws.onerror = () => {
      // eslint-disable-next-line promise-safety/no-bare-catch
      try { this.onerror?.(new Event("error")); } catch { /* ignore */ }
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.closed) return;
      this.readyState = SharedWebSocket.CONNECTING;
      this.setStatus("reconnecting");
      publishNetDiag({ type: "ws-close", url: this.url });
      this.election.broadcast({ kind: "close" });
      this.scheduleReconnect();
    };
  };

  private scheduleReconnect(): void {
    const base = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]!;
    // Jitter each reconnect by a fresh 0.5–1.5× factor (mirrors the
    // fetch-with-retry idiom, wider band). When a shared restart closes the
    // whole tab fleet at once, a fixed backoff would wake every tab in the same
    // millisecond and re-herd the backend; the per-call random spread
    // de-synchronizes them. Computed inline so repeated cycles don't resonate.
    const delay = base * (0.5 + Math.random());
    this.attempt++;
    publishNetDiag({ type: "ws-reconnect-scheduled", url: this.url, attempt: this.attempt });
    this.retryTimer = setTimeout(this.connectWs, delay);
  }

  private writeOrQueue(data: string): void {
    if (this.ws && this.ws.readyState === SharedWebSocket.OPEN) {
      // eslint-disable-next-line promise-safety/no-bare-catch
      try { this.ws.send(data); } catch { /* ignore */ }
    } else {
      this.queue.push(data);
    }
  }

  private teardownWs(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      // eslint-disable-next-line promise-safety/no-bare-catch
      try { ws.close(); } catch { /* ignore */ }
    }
  }

  // --- dispatchers ----------------------------------------------------------

  private dispatchOpen(): void {
    // eslint-disable-next-line promise-safety/no-bare-catch
    try { this.onopen?.(new Event("open")); } catch { /* ignore */ }
  }

  private dispatchMessage(data: string): void {
    // eslint-disable-next-line promise-safety/no-bare-catch
    try { this.onmessage?.(new MessageEvent("message", { data })); } catch { /* ignore */ }
  }

  // --- introspection (read-only; Layer 2 inspector) -------------------------

  /** Last-published status for this socket (null until the first transition). */
  get status(): WsStatus | null {
    return this.lastStatus;
  }

  /** Whether this tab currently owns the real socket (is the election leader). */
  get isLeader(): boolean {
    return this.election.isLeader;
  }

  /** Whether a live leader signal exists (this tab is leader or a leader's heartbeat is fresh). */
  get hasLeader(): boolean {
    return this.election.hasLeader();
  }

  // --- status bus -----------------------------------------------------------

  private setStatus(status: WsStatus): void {
    if (this.lastStatus === status) return;
    this.lastStatus = status;
    publishWsStatus({ url: this.url, status });
  }
}
