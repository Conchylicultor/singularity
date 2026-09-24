import { publishWsStatus, type WsStatus } from "./ws-status-bus";
import { ReconnectSchedule } from "./reconnect-backoff";

export interface ReconnectingEventSourceOptions {
  url: string;
  onMessage?: (data: string, eventName?: string) => void;
  onStatusChange?: (status: WsStatus) => void;
  // Named SSE events beyond the default "message" channel. Each name is
  // wired via `addEventListener(name, ...)` on the underlying EventSource.
  events?: string[];
}

// Thin reconnecting wrapper around a native EventSource. Opens one real
// connection per instance directly against `opts.url` and retries with the
// shared jittered backoff (`ReconnectSchedule`). Status transitions are published to the global
// `ws-status-bus` so the health toast ("Reconnected to server") fires for
// SSE drops the same way it does for WS.
export class ReconnectingEventSource {
  private es: EventSource | null = null;
  private reconnect = new ReconnectSchedule();
  private closed = false;
  private status: WsStatus = "connecting";

  constructor(private opts: ReconnectingEventSourceOptions) {
    this.connect();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.reconnect.cancel();
    if (this.es) {
      this.es.onerror = null;
      this.es.close();
      this.es = null;
    }
    this.setStatus("closed");
  }

  private connect = () => {
    if (this.closed) return;
    this.setStatus(
      this.reconnect.isFirstAttempt ? "connecting" : "reconnecting",
    );

    const es = new EventSource(this.opts.url);
    this.es = es;

    es.onopen = () => {
      this.reconnect.reset();
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
      this.setStatus("reconnecting");
      this.reconnect.schedule(this.connect);
    };
  };

  private setStatus(status: WsStatus) {
    if (this.status === status) return;
    this.status = status;
    publishWsStatus({ url: this.opts.url, status });
    this.opts.onStatusChange?.(status);
  }
}
