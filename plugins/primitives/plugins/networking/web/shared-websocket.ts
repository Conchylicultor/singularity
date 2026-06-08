import { publishWsStatus, type WsStatus } from "./ws-status-bus";
import { CrossTabElection } from "./cross-tab-election";

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
  private ws: WebSocket | null = null;
  private queue: string[] = [];
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private lastStatus: WsStatus | null = null;

  constructor(url: string | URL) {
    this.url = typeof url === "string" ? url : url.toString();
    const name = `singularity:shared-ws:${this.url}`;

    this.election = new CrossTabElection<WsRelayMsg>(name, {
      onElected: () => this.startLeading(),
      onFollowerMessage: (msg) => {
        if (msg.kind === "tx") this.writeOrQueue(msg.data);
      },
      onLeaderMessage: (msg) => {
        switch (msg.kind) {
          case "rx":
            this.dispatchMessage(msg.data);
            break;
          case "open":
            this.readyState = SharedWebSocket.OPEN;
            this.setStatus("open");
            this.dispatchOpen();
            break;
          case "close":
            this.readyState = SharedWebSocket.CONNECTING;
            this.setStatus("reconnecting");
            break;
          case "tx":
            break;
        }
      },
      onFollowerJoined: () => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.election.broadcast({ kind: "open" });
        }
      },
    });
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

    let ws: WebSocket;
    try {
      ws = new WebSocket(absUrl);
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
      this.election.broadcast({ kind: "close" });
      this.scheduleReconnect();
    };
  };

  private scheduleReconnect(): void {
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]!;
    this.attempt++;
    this.retryTimer = setTimeout(this.connectWs, delay);
  }

  private writeOrQueue(data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
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

  // --- status bus -----------------------------------------------------------

  private setStatus(status: WsStatus): void {
    if (this.lastStatus === status) return;
    this.lastStatus = status;
    publishWsStatus({ url: this.url, status });
  }
}
