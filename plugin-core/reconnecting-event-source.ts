import { publishWsStatus, type WsStatus } from "./ws-status-bus";

export interface ReconnectingEventSourceOptions {
  url: string;
  onMessage?: (data: string, eventName?: string) => void;
  onStatusChange?: (status: WsStatus) => void;
  // Named SSE events beyond the default "message" channel. Rarely used now
  // that all streams are multiplexed under /api/events and keyed by virtual
  // URL as the SSE event name.
  events?: string[];
}

// All SSE in the app is multiplexed over a single connection to /api/events.
// Consumers keep talking to virtual URLs (e.g. "/api/conversations/stream");
// the multiplex layer rewrites that into a subscription on the real stream
// and demuxes incoming frames by their SSE `event:` name (= virtual URL).
//
// Leader election is global (one Web Lock for all SSE, not per-URL). Follower
// tabs never open a real EventSource — they receive demuxed frames over a
// BroadcastChannel keyed per virtual URL, just as before.

const MULTIPLEX_URL = "/api/events";
const MULTIPLEX_LOCK = "singularity:sse:multiplex";
const BACKOFF_MS = [500, 1000, 2000, 5000];

type Envelope =
  | { kind: "event"; eventName?: string; data: string }
  | { kind: "status"; status: WsStatus };

const coordinators = new Map<string, Coordinator>();
let multiplex: Multiplex | null = null;

function getMultiplex(): Multiplex {
  if (!multiplex) multiplex = new Multiplex();
  return multiplex;
}

// Per-virtual-URL fan-out. Owns its tab-local subscribers and a
// BroadcastChannel for cross-tab fan-out. Does NOT open EventSource itself.
class Coordinator {
  private subs = new Set<ReconnectingEventSource>();
  private channel: BroadcastChannel | null = null;
  private status: WsStatus = "connecting";

  constructor(private url: string) {
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(`sse:${url}`);
      this.channel.onmessage = this.onChannelMessage;
    }
  }

  subscribe(sub: ReconnectingEventSource) {
    this.subs.add(sub);
    sub._setStatus(this.status);
  }

  unsubscribe(sub: ReconnectingEventSource) {
    this.subs.delete(sub);
    if (this.subs.size === 0) {
      this.channel?.close();
      this.channel = null;
      coordinators.delete(this.url);
      getMultiplex().removeUrl(this.url);
    }
  }

  hasSubscribers(): boolean {
    return this.subs.size > 0;
  }

  /** Dispatch a frame received by the multiplex leader to this URL's subscribers. */
  dispatchLeader(eventName: string | undefined, data: string) {
    for (const sub of this.subs) sub._onMessage(data, eventName);
    this.channel?.postMessage({ kind: "event", eventName, data } satisfies Envelope);
  }

  /** Update status for this virtual URL. */
  setStatus(status: WsStatus, broadcastToFollowers: boolean) {
    this.status = status;
    publishWsStatus({ url: this.url, status });
    for (const sub of this.subs) sub._setStatus(status);
    if (broadcastToFollowers) {
      this.channel?.postMessage({ kind: "status", status } satisfies Envelope);
    }
  }

  private onChannelMessage = (ev: MessageEvent<Envelope>) => {
    // Followers receive frames/status from whichever tab holds the lock.
    // Leader tab ignores its own echoes by noticing it already dispatched.
    if (getMultiplex().isLeader) return;
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

class Multiplex {
  private urls = new Set<string>();
  private es: EventSource | null = null;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private reopenScheduled = false;
  private listenerUrls = new Set<string>();
  isLeader = false;

  constructor() {
    const locks =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & { locks?: LockManager }).locks
        : undefined;
    if (locks && typeof BroadcastChannel !== "undefined") {
      void locks.request(MULTIPLEX_LOCK, { mode: "exclusive" }, () => {
        this.becomeLeader();
        // Hold the lock for the lifetime of the tab (released on tab close).
        return new Promise<void>(() => {});
      });
    } else {
      // Fallback: no Web Locks / BroadcastChannel — every tab is its own leader.
      this.becomeLeader();
    }
  }

  addUrl(url: string) {
    if (this.urls.has(url)) return;
    this.urls.add(url);
    this.scheduleReopen();
  }

  removeUrl(url: string) {
    if (!this.urls.delete(url)) return;
    this.scheduleReopen();
  }

  private becomeLeader() {
    this.isLeader = true;
    this.connect();
  }

  // Coalesce mount/unmount churn into a single reconnect per tick.
  private scheduleReopen() {
    if (!this.isLeader || this.reopenScheduled) return;
    this.reopenScheduled = true;
    queueMicrotask(() => {
      this.reopenScheduled = false;
      this.reopen();
    });
  }

  private reopen() {
    if (!this.isLeader) return;
    // If the live connection already covers exactly the active URL set, no-op.
    // This collapses React StrictMode's mount→unmount→mount churn from three
    // reconnects into zero.
    if (
      this.es &&
      this.listenerUrls.size === this.urls.size &&
      Array.from(this.urls).every((u) => this.listenerUrls.has(u))
    ) {
      return;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.es) {
      const old = this.es;
      this.es = null;
      old.onerror = null;
      old.close();
    }
    if (this.urls.size === 0) {
      // No active virtual URLs; stay disconnected until something subscribes.
      return;
    }
    this.connect();
  }

  private connect = () => {
    if (!this.isLeader || this.urls.size === 0) return;
    const urlsParam = Array.from(this.urls)
      .map((u) => encodeURIComponent(u))
      .join(",");
    const phase: WsStatus = this.attempt === 0 ? "connecting" : "reconnecting";
    this.broadcastStatus(phase);

    const es = new EventSource(`${MULTIPLEX_URL}?urls=${urlsParam}`);
    this.es = es;
    this.listenerUrls = new Set();

    for (const url of this.urls) this.attachListener(url);

    es.onopen = () => {
      this.attempt = 0;
      this.broadcastStatus("open");
    };

    es.onerror = () => {
      es.close();
      this.es = null;
      const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]!;
      this.attempt++;
      this.broadcastStatus("reconnecting");
      this.retryTimer = setTimeout(this.connect, delay);
    };
  };

  private attachListener(url: string) {
    if (!this.es || this.listenerUrls.has(url)) return;
    this.listenerUrls.add(url);
    this.es.addEventListener(url, (ev) => {
      const coord = coordinators.get(url);
      coord?.dispatchLeader(url, (ev as MessageEvent).data);
    });
  }

  private broadcastStatus(status: WsStatus) {
    for (const url of this.urls) {
      const coord = coordinators.get(url);
      coord?.setStatus(status, /* broadcastToFollowers */ true);
    }
  }
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
    coord.subscribe(this);
    getMultiplex().addUrl(opts.url);
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
