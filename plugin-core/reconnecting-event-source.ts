import { publishWsStatus, type WsStatus } from "./ws-status-bus";

export interface ReconnectingEventSourceOptions {
  url: string;
  onMessage?: (data: string, eventName?: string) => void;
  onStatusChange?: (status: WsStatus) => void;
  // Named SSE events beyond the default "message" channel. Each name is
  // wired via `addEventListener(name, ...)` on the underlying EventSource.
  events?: string[];
}

const BACKOFF_MS = [500, 1000, 2000, 5000];

// Thin reconnecting wrapper around a native EventSource. Opens one real
// connection per instance directly against `opts.url` and retries with
// bounded backoff. Status transitions are published to the global
// `ws-status-bus` so the health toast ("Reconnected to server") fires for
// SSE drops the same way it does for WS.
export class ReconnectingEventSource {
  private es: EventSource | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private closed = false;
  private status: WsStatus = "connecting";

  constructor(private opts: ReconnectingEventSourceOptions) {
    this.connect();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.es) {
      this.es.onerror = null;
      this.es.close();
      this.es = null;
    }
    this.setStatus("closed");
  }

  private connect = () => {
    if (this.closed) return;
    this.setStatus(this.attempt === 0 ? "connecting" : "reconnecting");

    const es = new EventSource(this.opts.url);
    this.es = es;

    es.onopen = () => {
      this.attempt = 0;
      this.setStatus("open");
    };

    es.onmessage = (ev) => {
      this.opts.onMessage?.(ev.data);
    };

    for (const name of this.opts.events ?? []) {
      es.addEventListener(name, (ev) => {
        this.opts.onMessage?.((ev as MessageEvent).data, name);
      });
    }

    es.onerror = () => {
      if (this.closed) return;
      es.onerror = null;
      es.close();
      this.es = null;
      const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]!;
      this.attempt++;
      this.setStatus("reconnecting");
      this.retryTimer = setTimeout(this.connect, delay);
    };
  };

  private setStatus(status: WsStatus) {
    if (this.status === status) return;
    this.status = status;
    publishWsStatus({ url: this.opts.url, status });
    this.opts.onStatusChange?.(status);
  }
}
