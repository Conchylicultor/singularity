import type { QueryClient } from "@tanstack/react-query";
import { SharedWebSocket } from "./shared-websocket";

// Drives the TanStack Query cache off server resource notifications. Uses
// SharedWebSocket, which transparently shares a single `/ws/notifications`
// connection across all tabs of the origin. On every (re)open of the real
// socket (including leader handoff and server restart), `replaySubs` resends
// every active subscription — the server's sub state is per-connection and
// this client is the source of truth for what the UI wants to observe.
//
// See research/2026-04-15-global-sse-lifecycle-mental-model-v3.md for the
// underlying protocol, and research/2026-04-16-plugin-core-shared-websocket-v2.md
// for the SharedWebSocket abstraction.

const WS_URL = "/ws/notifications";

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
  refcount: number;
  key: string;
  params: ResourceParams;
  version: number;
}

export class NotificationsClient {
  private ws: SharedWebSocket;
  /** (key, paramsKey) -> refcount + subscription state */
  private subs = new Map<string, ActiveSub>();
  private nextMsgId = 1;

  constructor(private queryClient: QueryClient) {
    this.ws = new SharedWebSocket(WS_URL);
    this.ws.onopen = this.replaySubs;
    this.ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.handleServerMessage(msg);
    };
  }

  /** Observer count increased for (key, params). Sub on 0→1. */
  observe(key: string, params: ResourceParams = {}): void {
    const id = `${key}\0${paramsKey(params)}`;
    const existing = this.subs.get(id);
    if (existing) {
      existing.refcount++;
      return;
    }
    this.subs.set(id, { refcount: 1, key, params, version: 0 });
    this.sendSub(key, params);
  }

  /** Observer count decreased. Unsub on 1→0. */
  unobserve(key: string, params: ResourceParams = {}): void {
    const id = `${key}\0${paramsKey(params)}`;
    const existing = this.subs.get(id);
    if (!existing) return;
    existing.refcount--;
    if (existing.refcount > 0) return;
    this.subs.delete(id);
    this.ws.send(JSON.stringify({ op: "unsub", key, params }));
  }

  private replaySubs = (): void => {
    // Fresh connection means the server has no record of our subs. Reset
    // local versions so a new sub-ack (which will come with a possibly lower
    // version if the server process restarted) isn't dropped as stale.
    for (const sub of this.subs.values()) {
      sub.version = 0;
      this.sendSub(sub.key, sub.params);
    }
  };

  private sendSub(key: string, params: ResourceParams): void {
    this.ws.send(
      JSON.stringify({ op: "sub", id: this.nextMsgId++, key, params }),
    );
  }

  private handleServerMessage(msg: ServerMsg): void {
    if (msg.kind === "ping") {
      // Server keepalive; no app-level action needed. Per-tab duplicate
      // responses would be harmless (server ignores `pong`) but skipping
      // avoids N× writes through the leader per ping.
      return;
    }
    if (msg.kind === "sub-error") {
      console.error(`[notifications] sub-error key=${msg.key} reason=${msg.reason}`);
      return;
    }
    if (msg.kind === "sub-ack" || msg.kind === "update") {
      this.applyUpdate(msg.key, msg.params, msg.value, msg.version);
      return;
    }
    if (msg.kind === "invalidate") {
      this.applyInvalidate(msg.key, msg.params, msg.version);
      return;
    }
  }

  private applyUpdate(
    key: string,
    params: ResourceParams,
    value: unknown,
    version: number,
  ): void {
    const id = `${key}\0${paramsKey(params)}`;
    const entry = this.subs.get(id);
    if (entry) {
      if (version <= entry.version) return;
      entry.version = version;
    }
    this.queryClient.setQueryData(queryKeyFor(key, params), value);
  }

  private applyInvalidate(
    key: string,
    params: ResourceParams,
    version: number,
  ): void {
    const id = `${key}\0${paramsKey(params)}`;
    const entry = this.subs.get(id);
    if (entry) {
      if (version <= entry.version) return;
      entry.version = version;
    }
    void this.queryClient.invalidateQueries({ queryKey: queryKeyFor(key, params) });
  }
}
