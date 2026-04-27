import { publishWsStatus, type WsStatus } from "./ws-status-bus";

// Drop-in replacement for the string-message subset of the native WebSocket
// API. A single tab per origin holds a Web Lock and owns the underlying
// connection; other tabs route `send()` / `onmessage` through a
// BroadcastChannel. When the leader tab dies, a new one is elected and opens
// a fresh socket; `onopen` fires again on every (re)open of the real socket
// in every tab, so consumers can replay server-side state the same way they
// would with a plain reconnecting WebSocket. All cross-tab coordination is
// private.

const BACKOFF_MS = [500, 1000, 2000, 5000];

type InternalMsg =
  | { kind: "tx"; data: string }
  | { kind: "rx"; data: string }
  | { kind: "open" }
  | { kind: "close" }
  | { kind: "hello" };

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

  private name: string;
  private channel: BroadcastChannel | null = null;
  private ws: WebSocket | null = null;
  private isLeader = false;
  private closed = false;
  private outboundQueue: string[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private lastStatus: WsStatus | null = null;

  constructor(url: string | URL) {
    this.url = typeof url === "string" ? url : url.toString();
    this.name = `singularity:shared-ws:${this.url}`;

    const hasChannel = typeof BroadcastChannel !== "undefined";
    const locks =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & { locks?: LockManager }).locks
        : undefined;

    if (!hasChannel || !locks) {
      // Fallback: no cross-tab coordination. Every tab is its own leader.
      this.isLeader = true;
      this.connectWs();
      return;
    }

    this.channel = new BroadcastChannel(this.name);
    this.channel.onmessage = this.onChannelMessage;

    // Announce so the current leader (if any) can echo its status, which
    // brings this follower to OPEN immediately instead of waiting for the
    // next real-WS transition.
    this.postChannel({ kind: "hello" });

    void locks.request(this.name, { mode: "exclusive" }, () => {
      if (this.closed) return;
      this.becomeLeader();
      // Hold for the lifetime of this tab. The promise never resolves, so
      // the lock is only released when the tab (i.e. the agent running this
      // worker) is torn down.
      return new Promise<void>(() => {});
    });
  }

  send(data: string): void {
    if (this.closed) return;
    if (this.isLeader) {
      this.writeOrQueue(data);
    } else {
      this.postChannel({ kind: "tx", data });
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = SharedWebSocket.CLOSED;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.isLeader && this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {
        // ignore
      }
    }
    this.channel?.close();
    this.channel = null;
    this.dispatchClose(1000, "handle closed");
  }

  // --- leader path ---------------------------------------------------------

  private becomeLeader(): void {
    if (this.closed) return;
    this.isLeader = true;
    this.connectWs();
  }

  private connectWs = (): void => {
    if (this.closed) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.setStatus(this.reconnectAttempt === 0 ? "connecting" : "reconnecting");

    const proto =
      typeof location !== "undefined" && location.protocol === "https:" ? "wss" : "ws";
    const host = typeof location !== "undefined" ? location.host : "";
    const absUrl = /^wss?:\/\//i.test(this.url)
      ? this.url
      : `${proto}://${host}${this.url}`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(absUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.readyState = SharedWebSocket.OPEN;
      while (this.outboundQueue.length > 0) {
        const msg = this.outboundQueue.shift()!;
        try {
          ws.send(msg);
        } catch {
          // ignore
        }
      }
      this.setStatus("open");
      this.postChannel({ kind: "open" });
      this.dispatchOpen();
    };

    ws.onmessage = (ev) => {
      const data = typeof ev.data === "string" ? ev.data : "";
      this.postChannel({ kind: "rx", data });
      this.dispatchMessage(data);
    };

    ws.onerror = () => {
      this.dispatchError();
    };

    ws.onclose = () => {
      this.ws = null;
      if (this.closed) return;
      this.readyState = SharedWebSocket.CONNECTING;
      this.postChannel({ kind: "close" });
      this.scheduleReconnect();
    };
  };

  private scheduleReconnect(): void {
    const delay = BACKOFF_MS[Math.min(this.reconnectAttempt, BACKOFF_MS.length - 1)]!;
    this.reconnectAttempt++;
    this.setStatus("reconnecting");
    this.reconnectTimer = setTimeout(this.connectWs, delay);
  }

  private writeOrQueue(data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(data);
      } catch {
        // ignore
      }
    } else {
      this.outboundQueue.push(data);
    }
  }

  // --- channel listener ---------------------------------------------------

  private onChannelMessage = (ev: MessageEvent<InternalMsg>): void => {
    const msg = ev.data;
    switch (msg.kind) {
      case "tx":
        if (this.isLeader) this.writeOrQueue(msg.data);
        return;
      case "rx":
        if (!this.isLeader) this.dispatchMessage(msg.data);
        return;
      case "open":
        if (!this.isLeader) {
          this.readyState = SharedWebSocket.OPEN;
          this.setStatus("open");
          this.dispatchOpen();
        }
        return;
      case "close":
        if (!this.isLeader) {
          this.readyState = SharedWebSocket.CONNECTING;
          this.setStatus("reconnecting");
        }
        return;
      case "hello":
        if (
          this.isLeader &&
          this.ws &&
          this.ws.readyState === WebSocket.OPEN
        ) {
          this.postChannel({ kind: "open" });
        }
        return;
    }
  };

  private postChannel(msg: InternalMsg): void {
    if (this.channel && !this.closed) {
      try {
        this.channel.postMessage(msg);
      } catch {
        // ignore
      }
    }
  }

  // --- dispatchers --------------------------------------------------------

  private dispatchOpen(): void {
    try {
      this.onopen?.(new Event("open"));
    } catch {
      // ignore
    }
  }

  private dispatchMessage(data: string): void {
    try {
      this.onmessage?.(new MessageEvent("message", { data }));
    } catch {
      // ignore
    }
  }

  private dispatchError(): void {
    try {
      this.onerror?.(new Event("error"));
    } catch {
      // ignore
    }
  }

  private dispatchClose(code: number, reason: string): void {
    try {
      this.onclose?.(new CloseEvent("close", { code, reason, wasClean: true }));
    } catch {
      // ignore
    }
  }

  // --- status bus ---------------------------------------------------------

  private setStatus(status: WsStatus): void {
    if (this.lastStatus === status) return;
    this.lastStatus = status;
    publishWsStatus({ url: this.url, status });
  }
}
