import type { NetDiagEvent } from "./net-diag-bus";
import { ReconnectSchedule } from "./reconnect-backoff";
import type { SocketFault } from "./shared-ws-protocol";
import type { MakeWebSocket, WebSocketLike } from "./transport-types";
import type { WsStatus } from "./ws-status-bus";

const WS_OPEN = 1;

export interface SocketOwnerEvents {
  /** Every status transition; `conn` names the server connection while "open". */
  onStatus(status: WsStatus, conn: string | null): void;
  onMessage(data: string): void;
  onError(): void;
  onDiag(event: NetDiagEvent): void;
}

/**
 * The one real WebSocket for a URL: connect, queue-until-open, reconnect with
 * backoff, and a fresh connection id per real open. Lives inside the
 * SharedWorker (`shared-ws-host.ts`), so exactly one exists per URL per worker
 * build — by construction, not by election.
 *
 * Runs in the worker bundle: imports only this plugin's own files (see
 * `reconnect-backoff.ts`).
 */
export class SocketOwner {
  status: WsStatus = "connecting";
  /** Identity of the current server connection; null while not open. */
  conn: string | null = null;

  private ws: WebSocketLike | null = null;
  private queue: string[] = [];
  private reconnect = new ReconnectSchedule();
  private closed = false;
  /** Test fault: new connection attempts park instead of dialing. */
  private held = false;
  /** A connection attempt parked by `held`, run on release. */
  private parked = false;

  constructor(
    private readonly url: string,
    private readonly makeWebSocket: MakeWebSocket,
    private readonly events: SocketOwnerEvents,
  ) {}

  start(): void {
    this.setStatus("connecting", null);
    this.connect();
  }

  /** Write now, or queue until the next open. */
  send(data: string): void {
    if (this.closed) return;
    if (this.ws && this.ws.readyState === WS_OPEN) this.write(this.ws, data);
    else this.queue.push(data);
  }

  /**
   * Write only if a connection is open. For frames that describe the CURRENT
   * connection's state (a departing port's will): a new connection never held
   * that state, so replaying it there would be meaningless.
   */
  sendIfOpen(data: string): void {
    if (this.closed) return;
    if (this.ws && this.ws.readyState === WS_OPEN) this.write(this.ws, data);
  }

  /**
   * Simulate a fault, for e2e tests (`core/ws-test-hook.ts`): `drop` loses the
   * current connection the way a network drop does (the server sees a close,
   * the reconnect path runs); `hold` parks every new connection attempt until
   * `release`.
   */
  fault(fault: SocketFault): void {
    if (this.closed) return;
    switch (fault) {
      case "drop": {
        const ws = this.ws;
        if (!ws) return;
        this.detach(ws);
        ws.close();
        this.lost();
        return;
      }
      case "hold":
        this.held = true;
        return;
      case "release":
        this.held = false;
        if (this.parked) {
          this.parked = false;
          this.connect();
        }
        return;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.reconnect.cancel();
    this.queue = [];
    const ws = this.ws;
    this.ws = null;
    this.conn = null;
    if (!ws) return;
    this.detach(ws);
    ws.close();
  }

  private detach(ws: WebSocketLike): void {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
  }

  /** The connection is gone (closed by the server, the network, or a `drop`). */
  private lost(): void {
    this.ws = null;
    if (this.closed) return;
    this.events.onDiag({ type: "ws-close", url: this.url });
    this.setStatus("reconnecting", null);
    this.scheduleReconnect();
  }

  private connect = (): void => {
    if (this.closed) return;
    this.reconnect.cancel();
    if (this.held) {
      this.parked = true;
      return;
    }

    let ws: WebSocketLike;
    try {
      ws = this.makeWebSocket(this.url);
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.reconnect.reset();
      for (const data of this.queue.splice(0)) this.write(ws, data);
      this.events.onDiag({ type: "ws-open", url: this.url });
      this.setStatus("open", crypto.randomUUID());
    };
    ws.onmessage = (ev) => {
      this.events.onMessage(typeof ev.data === "string" ? ev.data : "");
    };
    ws.onerror = () => {
      this.events.onError();
    };
    ws.onclose = () => this.lost();
  };

  private scheduleReconnect(): void {
    const attempt = this.reconnect.schedule(this.connect);
    this.events.onDiag({
      type: "ws-reconnect-scheduled",
      url: this.url,
      attempt,
    });
  }

  private write(ws: WebSocketLike, data: string): void {
    /* eslint-disable promise-safety/no-bare-catch -- a dead socket throws on send; its onclose drives the reconnect */
    try {
      ws.send(data);
    } catch {
      /* ignore */
    }
    /* eslint-enable promise-safety/no-bare-catch */
  }

  private setStatus(status: WsStatus, conn: string | null): void {
    this.status = status;
    this.conn = conn;
    this.events.onStatus(status, conn);
  }
}
