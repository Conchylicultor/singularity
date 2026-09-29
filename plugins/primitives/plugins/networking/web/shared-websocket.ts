import { publishWsStatus, type WsStatus } from "./ws-status-bus";
import { publishNetDiag } from "./net-diag-bus";
import { CrossTabElection } from "./cross-tab-election";
import { ReconnectSchedule } from "./reconnect-backoff";
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

type WsRelayMsg =
  | { kind: "rx"; data: string }
  | { kind: "tx"; data: string }
  | { kind: "open"; conn: string }
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
  private reconnect = new ReconnectSchedule();
  private closed = false;
  private lastStatus: WsStatus | null = null;
  /**
   * Identity of the server connection this tab last dispatched `onopen` for —
   * the one its consumers' state (NotificationsClient's subs) is registered
   * on. Every real socket open mints a fresh id, carried on the leader's
   * `open` relay. `null` = not bound to any connection (never opened, or a
   * `close` / demotion since).
   */
  private boundConn: string | null = null;

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
    if (hooks?.heartbeatMs !== undefined)
      electionOpts.heartbeatMs = hooks.heartbeatMs;
    if (hooks?.timeoutMs !== undefined)
      electionOpts.timeoutMs = hooks.timeoutMs;
    if (hooks?.makeBroadcastChannel !== undefined) {
      electionOpts.makeBroadcastChannel = hooks.makeBroadcastChannel;
    }
    if (hooks?.locks !== undefined) electionOpts.locks = hooks.locks;

    this.election = new CrossTabElection<WsRelayMsg>(
      name,
      {
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
              // Consumers treat onopen as "fresh connection, replay state"
              // (NotificationsClient replays its whole sub set onto it), so it
              // dispatches exactly once per server connection — decided by the
              // connection's identity, not by this tab's readyState:
              //  - the leader rebroadcasts "open" for the SAME connection to
              //    ALL followers whenever a tab joins (onFollowerJoined below);
              //    an already-bound follower must not re-replay on every join;
              //  - a NEW connection must always dispatch, even to a follower
              //    that never left OPEN. A leader that dies or freezes
              //    broadcasts no "close", so on failover the new leader's
              //    socket is the first thing followers hear — and the server
              //    holds none of their subs on it. Gating on readyState
              //    stranded every follower's subs until the next
              //    missed-update probe.
              this.readyState = SharedWebSocket.OPEN;
              this.setStatus("open");
              publishNetDiag({ type: "ws-open", url: this.url });
              if (msg.conn !== this.boundConn) {
                this.boundConn = msg.conn;
                this.dispatchOpen();
              }
              break;
            }
            case "close":
              this.boundConn = null;
              this.readyState = SharedWebSocket.CONNECTING;
              this.setStatus("reconnecting");
              publishNetDiag({ type: "ws-close", url: this.url });
              break;
            case "tx":
              break;
          }
        },
        onFollowerJoined: () => {
          if (
            this.ws?.readyState === SharedWebSocket.OPEN &&
            this.boundConn !== null
          ) {
            this.election.broadcast({ kind: "open", conn: this.boundConn });
          }
        },
      },
      electionOpts,
    );
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
    this.boundConn = null;
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
    /* eslint-disable promise-safety/no-bare-catch -- a throwing onclose listener must not break close() */
    try {
      this.onclose?.(
        new CloseEvent("close", {
          code: 1000,
          reason: "handle closed",
          wasClean: true,
        }),
      );
    } catch {
      /* ignore */
    }
    /* eslint-enable promise-safety/no-bare-catch */
  }

  // --- leader: WebSocket management -----------------------------------------

  private startLeading(): void {
    if (this.closed) return;
    this.teardownWs();
    this.reconnect.reset();
    this.setStatus("connecting");
    this.connectWs();
  }

  private connectWs = (): void => {
    if (this.closed) return;
    this.reconnect.cancel();

    const proto =
      typeof location !== "undefined" && location.protocol === "https:"
        ? "wss"
        : "ws";
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
      this.reconnect.reset();
      this.readyState = SharedWebSocket.OPEN;
      while (this.queue.length > 0) {
        const msg = this.queue.shift()!;
        /* eslint-disable promise-safety/no-bare-catch -- a throwing listener or a dead socket must not break the relay */
        try {
          ws.send(msg);
        } catch {
          /* ignore */
        }
        /* eslint-enable promise-safety/no-bare-catch */
      }
      const conn = crypto.randomUUID();
      this.boundConn = conn;
      this.setStatus("open");
      publishNetDiag({ type: "ws-open", url: this.url });
      this.election.broadcast({ kind: "open", conn });
      this.dispatchOpen();
    };

    ws.onmessage = (ev) => {
      const data = typeof ev.data === "string" ? ev.data : "";
      this.election.broadcast({ kind: "rx", data });
      this.dispatchMessage(data);
    };

    ws.onerror = () => {
      /* eslint-disable promise-safety/no-bare-catch -- a throwing listener or a dead socket must not break the relay */
      try {
        this.onerror?.(new Event("error"));
      } catch {
        /* ignore */
      }
      /* eslint-enable promise-safety/no-bare-catch */
    };

    ws.onclose = () => {
      this.ws = null;
      this.boundConn = null;
      if (this.closed) return;
      this.readyState = SharedWebSocket.CONNECTING;
      this.setStatus("reconnecting");
      publishNetDiag({ type: "ws-close", url: this.url });
      this.election.broadcast({ kind: "close" });
      this.scheduleReconnect();
    };
  };

  private scheduleReconnect(): void {
    const attempt = this.reconnect.schedule(this.connectWs);
    publishNetDiag({ type: "ws-reconnect-scheduled", url: this.url, attempt });
  }

  private writeOrQueue(data: string): void {
    if (this.ws && this.ws.readyState === SharedWebSocket.OPEN) {
      /* eslint-disable promise-safety/no-bare-catch -- a throwing listener or a dead socket must not break the relay */
      try {
        this.ws.send(data);
      } catch {
        /* ignore */
      }
      /* eslint-enable promise-safety/no-bare-catch */
    } else {
      this.queue.push(data);
    }
  }

  private teardownWs(): void {
    this.reconnect.cancel();
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      /* eslint-disable promise-safety/no-bare-catch -- a throwing listener or a dead socket must not break the relay */
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      /* eslint-enable promise-safety/no-bare-catch */
    }
  }

  // --- dispatchers ----------------------------------------------------------

  private dispatchOpen(): void {
    /* eslint-disable promise-safety/no-bare-catch -- a throwing listener or a dead socket must not break the relay */
    try {
      this.onopen?.(new Event("open"));
    } catch {
      /* ignore */
    }
    /* eslint-enable promise-safety/no-bare-catch */
  }

  private dispatchMessage(data: string): void {
    /* eslint-disable promise-safety/no-bare-catch -- a throwing listener or a dead socket must not break the relay */
    try {
      this.onmessage?.(new MessageEvent("message", { data }));
    } catch {
      /* ignore */
    }
    /* eslint-enable promise-safety/no-bare-catch */
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
