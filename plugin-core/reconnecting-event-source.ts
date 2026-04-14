import { publishWsStatus, type WsStatus } from "./ws-status-bus";

export interface ReconnectingEventSourceOptions {
  url: string;
  onMessage?: (data: string, eventName?: string) => void;
  onStatusChange?: (status: WsStatus) => void;
  // Named SSE events beyond the default "message" channel.
  events?: string[];
}

// SSE fanout is shared across tabs: one tab wins a Web Lock keyed by URL and
// opens the real EventSource; other tabs attach as followers over a
// BroadcastChannel. This caps backend SSE connections at one per URL per
// browser, not one per tab per subscription, which is what kept saturating
// Bun when many tabs were open.

type Envelope =
  | { kind: "event"; eventName?: string; data: string }
  | { kind: "status"; status: WsStatus };

const BACKOFF_MS = [500, 1000, 2000, 5000];
const coordinators = new Map<string, Coordinator>();

class Coordinator {
  private subs = new Set<ReconnectingEventSource>();
  private eventNames = new Set<string>();
  private channel: BroadcastChannel | null = null;
  private isLeader = false;
  private lockReleaser: (() => void) | null = null;

  private es: EventSource | null = null;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private status: WsStatus = "connecting";

  constructor(private url: string) {
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(`sse:${url}`);
      this.channel.onmessage = this.onChannelMessage;
    }

    const locks = typeof navigator !== "undefined"
      ? (navigator as Navigator & { locks?: LockManager }).locks
      : undefined;

    if (locks && this.channel) {
      locks.request(`sse:${url}`, { mode: "exclusive" }, () => {
        if (this.disposed) return;
        this.becomeLeader();
        return new Promise<void>((resolve) => {
          this.lockReleaser = resolve;
        });
      });
    } else {
      // No Web Locks / BroadcastChannel: fall back to per-tab connections.
      this.becomeLeader();
    }
  }

  subscribe(sub: ReconnectingEventSource, events: string[]) {
    this.subs.add(sub);
    for (const name of events) {
      if (this.eventNames.has(name)) continue;
      this.eventNames.add(name);
      this.attachNamedListener(name);
    }
    sub._setStatus(this.status);
  }

  unsubscribe(sub: ReconnectingEventSource) {
    this.subs.delete(sub);
    if (this.subs.size === 0) this.dispose();
  }

  private dispose() {
    this.disposed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.es?.close();
    this.es = null;
    this.channel?.close();
    this.channel = null;
    this.lockReleaser?.();
    coordinators.delete(this.url);
  }

  private becomeLeader() {
    this.isLeader = true;
    this.connect();
  }

  private connect = () => {
    if (this.disposed) return;
    this.setStatus(this.attempt === 0 ? "connecting" : "reconnecting");
    const es = new EventSource(this.url);
    this.es = es;

    es.onopen = () => {
      if (this.disposed) return;
      this.attempt = 0;
      this.setStatus("open");
    };

    es.onmessage = (ev) => this.dispatchEvent(undefined, ev.data);

    es.onerror = () => {
      if (this.disposed) return;
      es.close();
      this.es = null;
      const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]!;
      this.attempt++;
      this.setStatus("reconnecting");
      this.retryTimer = setTimeout(this.connect, delay);
    };

    for (const name of this.eventNames) this.attachNamedListener(name);
  };

  private attachNamedListener(name: string) {
    if (!this.isLeader || !this.es) return;
    this.es.addEventListener(name, (ev) => {
      this.dispatchEvent(name, (ev as MessageEvent).data);
    });
  }

  private dispatchEvent(eventName: string | undefined, data: string) {
    for (const sub of this.subs) sub._onMessage(data, eventName);
    this.channel?.postMessage({ kind: "event", eventName, data } satisfies Envelope);
  }

  private setStatus(status: WsStatus) {
    this.status = status;
    publishWsStatus({ url: this.url, status });
    for (const sub of this.subs) sub._setStatus(status);
    this.channel?.postMessage({ kind: "status", status } satisfies Envelope);
  }

  private onChannelMessage = (ev: MessageEvent<Envelope>) => {
    if (this.isLeader) return;
    const env = ev.data;
    if (env.kind === "event") {
      for (const sub of this.subs) sub._onMessage(env.data, env.eventName);
    } else if (env.kind === "status") {
      this.status = env.status;
      publishWsStatus({ url: this.url, status: env.status });
      for (const sub of this.subs) sub._setStatus(env.status);
    }
  };
}

export class ReconnectingEventSource {
  private coord: Coordinator;

  constructor(private opts: ReconnectingEventSourceOptions) {
    let coord = coordinators.get(opts.url);
    if (!coord) {
      coord = new Coordinator(opts.url);
      coordinators.set(opts.url, coord);
    }
    this.coord = coord;
    coord.subscribe(this, opts.events ?? []);
  }

  close(): void {
    this.coord.unsubscribe(this);
  }

  /** @internal */
  _onMessage(data: string, eventName?: string): void {
    this.opts.onMessage?.(data, eventName);
  }

  /** @internal */
  _setStatus(status: WsStatus): void {
    this.opts.onStatusChange?.(status);
  }
}
