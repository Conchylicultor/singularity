import { publishWsStatus, type WsStatus } from "./ws-status-bus";

export interface ReconnectingEventSourceOptions {
  url: string;
  onMessage?: (data: string) => void;
  onStatusChange?: (status: WsStatus) => void;
}

const BACKOFF_MS = [500, 1000, 2000, 5000];

export class ReconnectingEventSource {
  private es: EventSource | null = null;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private opts: ReconnectingEventSourceOptions) {
    this.connect();
  }

  close(): void {
    this.disposed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.es?.close();
    this.es = null;
    this.setStatus("closed");
  }

  private setStatus(status: WsStatus) {
    publishWsStatus({ url: this.opts.url, status });
    this.opts.onStatusChange?.(status);
  }

  private connect = () => {
    if (this.disposed) return;
    this.setStatus(this.attempt === 0 ? "connecting" : "reconnecting");
    const es = new EventSource(this.opts.url);
    this.es = es;

    es.onopen = () => {
      if (this.disposed) return;
      this.attempt = 0;
      this.setStatus("open");
    };

    es.onmessage = (ev) => {
      this.opts.onMessage?.(ev.data);
    };

    es.onerror = () => {
      // EventSource auto-retries by default; we want our own backoff curve and
      // status reporting, so close it and reschedule.
      if (this.disposed) return;
      es.close();
      this.es = null;
      const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]!;
      this.attempt++;
      this.setStatus("reconnecting");
      this.retryTimer = setTimeout(this.connect, delay);
    };
  };
}
