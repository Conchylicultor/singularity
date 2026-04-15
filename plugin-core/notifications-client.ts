import type { QueryClient } from "@tanstack/react-query";

// Single WS to /ws/notifications per app instance (leader-elected across tabs
// via Web Lock). Drives the TanStack Query cache: incoming `update` messages
// become setQueryData; `invalidate` messages become invalidateQueries.
//
// See research/2026-04-15-global-sse-lifecycle-mental-model-v3.md.

const LEADER_LOCK = "singularity:notifications:leader";
const WS_URL = "/ws/notifications";
const BACKOFF_MS = [500, 1000, 2000, 5000];
const CHANNEL = "singularity:notifications";

type ResourceParams = Record<string, string>;

export interface ResourceKey {
  key: string;
  params?: ResourceParams;
}

type ServerMsg =
  | { kind: "sub-ack"; id?: number; key: string; params: ResourceParams; value: unknown; version: number }
  | { kind: "update"; key: string; params: ResourceParams; value: unknown; version: number }
  | { kind: "invalidate"; key: string; params: ResourceParams; version: number }
  | { kind: "sub-error"; id?: number; key: string; reason: string }
  | { kind: "ping" };

type FollowerMsg =
  | { kind: "update"; key: string; params: ResourceParams; value: unknown; version: number }
  | { kind: "invalidate"; key: string; params: ResourceParams; version: number };

function paramsKey(params: ResourceParams | undefined): string {
  if (!params) return "{}";
  const keys = Object.keys(params).sort();
  const obj: ResourceParams = {};
  for (const k of keys) obj[k] = params[k]!;
  return JSON.stringify(obj);
}

export function queryKeyFor(key: string, params: ResourceParams | undefined): unknown[] {
  const p = params && Object.keys(params).length > 0 ? params : undefined;
  return p ? [key, p] : [key];
}

interface ActiveSub {
  key: string;
  params: ResourceParams;
  pk: string;
  version: number;
}

export class NotificationsClient {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private isLeader = false;
  /** (key, paramsKey) -> refcount + subscription state */
  private subs = new Map<string, { refcount: number; sub: ActiveSub }>();
  private nextMsgId = 1;
  private channel: BroadcastChannel | null = null;

  constructor(private queryClient: QueryClient) {
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = this.onChannelMessage;
    }
    const locks =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & { locks?: LockManager }).locks
        : undefined;
    if (locks) {
      void locks.request(LEADER_LOCK, { mode: "exclusive" }, () => {
        this.becomeLeader();
        // Hold for the lifetime of this tab.
        return new Promise<void>(() => {});
      });
    } else {
      // No Web Locks — every tab opens its own WS. Correct, just N×.
      this.becomeLeader();
    }
  }

  /** Observer count increased for (key, params). Sub on 0→1. */
  observe(key: string, params: ResourceParams = {}): void {
    const pk = paramsKey(params);
    const id = `${key}\0${pk}`;
    const existing = this.subs.get(id);
    if (existing) {
      existing.refcount++;
      return;
    }
    this.subs.set(id, {
      refcount: 1,
      sub: { key, params, pk, version: 0 },
    });
    this.sendSub(key, params);
  }

  /** Observer count decreased. Unsub on 1→0. */
  unobserve(key: string, params: ResourceParams = {}): void {
    const pk = paramsKey(params);
    const id = `${key}\0${pk}`;
    const existing = this.subs.get(id);
    if (!existing) return;
    existing.refcount--;
    if (existing.refcount > 0) return;
    this.subs.delete(id);
    this.sendUnsub(key, params);
  }

  private becomeLeader(): void {
    this.isLeader = true;
    this.connect();
  }

  private connect = (): void => {
    if (!this.isLeader) return;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const proto = typeof location !== "undefined" && location.protocol === "https:" ? "wss" : "ws";
    const host = typeof location !== "undefined" ? location.host : "";
    const ws = new WebSocket(`${proto}://${host}${WS_URL}`);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      // Replay all active subscriptions.
      for (const { sub } of this.subs.values()) {
        this.wsSend({ op: "sub", id: this.nextMsgId++, key: sub.key, params: sub.params });
      }
    };
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.handleServerMessage(msg);
    };
    ws.onerror = () => {
      // Let onclose handle reconnect.
    };
    ws.onclose = () => {
      this.ws = null;
      if (!this.isLeader) return;
      const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)]!;
      this.attempt++;
      this.retryTimer = setTimeout(this.connect, delay);
    };
  };

  private wsSend(obj: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(obj));
    } catch {
      // ignore
    }
  }

  private sendSub(key: string, params: ResourceParams): void {
    if (!this.isLeader) return;
    this.wsSend({ op: "sub", id: this.nextMsgId++, key, params });
  }

  private sendUnsub(key: string, params: ResourceParams): void {
    if (!this.isLeader) return;
    this.wsSend({ op: "unsub", key, params });
  }

  private handleServerMessage(msg: ServerMsg): void {
    if (msg.kind === "ping") {
      this.wsSend({ kind: "pong" });
      return;
    }
    if (msg.kind === "sub-error") {
      console.error(`[notifications] sub-error key=${msg.key} reason=${msg.reason}`);
      return;
    }
    if (msg.kind === "sub-ack" || msg.kind === "update") {
      this.applyUpdate(msg.key, msg.params, msg.value, msg.version);
      if (msg.kind === "update") {
        this.channel?.postMessage({
          kind: "update",
          key: msg.key,
          params: msg.params,
          value: msg.value,
          version: msg.version,
        } satisfies FollowerMsg);
      }
      return;
    }
    if (msg.kind === "invalidate") {
      this.applyInvalidate(msg.key, msg.params, msg.version);
      this.channel?.postMessage({
        kind: "invalidate",
        key: msg.key,
        params: msg.params,
        version: msg.version,
      } satisfies FollowerMsg);
      return;
    }
  }

  private applyUpdate(
    key: string,
    params: ResourceParams,
    value: unknown,
    version: number,
  ): void {
    const pk = paramsKey(params);
    const id = `${key}\0${pk}`;
    const entry = this.subs.get(id);
    if (entry) {
      if (version <= entry.sub.version) return;
      entry.sub.version = version;
    }
    this.queryClient.setQueryData(queryKeyFor(key, params), value);
  }

  private applyInvalidate(
    key: string,
    params: ResourceParams,
    version: number,
  ): void {
    const pk = paramsKey(params);
    const id = `${key}\0${pk}`;
    const entry = this.subs.get(id);
    if (entry) {
      if (version <= entry.sub.version) return;
      entry.sub.version = version;
    }
    void this.queryClient.invalidateQueries({ queryKey: queryKeyFor(key, params) });
  }

  private onChannelMessage = (ev: MessageEvent<FollowerMsg>): void => {
    // Followers receive fan-out from the leader. Leader ignores its own echoes
    // because BroadcastChannel does not deliver to the sender.
    const msg = ev.data;
    if (msg.kind === "update") {
      this.applyUpdate(msg.key, msg.params, msg.value, msg.version);
    } else if (msg.kind === "invalidate") {
      this.applyInvalidate(msg.key, msg.params, msg.version);
    }
  };
}
