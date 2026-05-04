import type { QueryClient } from "@tanstack/react-query";
import type { ZodType } from "zod";
import {
  SharedWebSocket,
  subscribeWsStatus,
  type WsStatus,
} from "@plugins/primitives/plugins/networking/web";
import type { ResourceOrigin } from "../shared/resource";

// Drives the TanStack Query cache off server resource notifications. Uses
// SharedWebSocket, which transparently shares the connection across all tabs
// of the origin. On every (re)open of the real socket (including leader
// handoff and backend restart), `replaySubs` resends every active
// subscription — the server's sub state is per-connection and this client is
// the source of truth for what the UI wants to observe.
//
// The client maintains one socket per *resource origin*: the per-worktree
// backend (default) at /ws/notifications, and the central runtime at
// /ws/central-notifications. Subscriptions route to the right socket based on
// the descriptor's `origin` field.

const WS_URLS = {
  worktree: "/ws/notifications",
  central: "/ws/central-notifications",
} as const;

type SocketKind = keyof typeof WS_URLS;

export type ChannelStatuses = { worktree: WsStatus; central: WsStatus };

function socketKindFor(origin: ResourceOrigin | undefined): SocketKind {
  return origin === "central" ? "central" : "worktree";
}

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
  socket: SocketKind;
}

interface SocketChannel {
  ws: SharedWebSocket;
  /** (key, paramsKey) -> subscription state for subs routed to this socket. */
  subs: Map<string, ActiveSub>;
}

export class NotificationsClient {
  private channels: Record<SocketKind, SocketChannel>;
  private nextMsgId = 1;
  /**
   * key → Zod schema. Registered on every observe() call from useResource.
   * Used in applyUpdate to parse WS payloads before they hit the cache.
   * Last-write-wins is fine: the same key always pairs to the same schema
   * (resources are singletons defined at module scope).
   */
  private schemas = new Map<string, ZodType<unknown>>();
  private channelStatuses = new Map<string, WsStatus>();
  private statusListeners = new Set<(s: WsStatus) => void>();
  private channelStatusListeners = new Set<(s: ChannelStatuses) => void>();
  private unsubscribeFromBus: () => void;

  constructor(private queryClient: QueryClient) {
    this.channels = {
      worktree: this.openChannel("worktree"),
      central: this.openChannel("central"),
    };
    const ownedUrls = new Set<string>(Object.values(WS_URLS));
    this.unsubscribeFromBus = subscribeWsStatus(({ url, status }) => {
      if (!ownedUrls.has(url)) return;
      this.channelStatuses.set(url, status);
      const next = this.getStatus();
      for (const fn of this.statusListeners) fn(next);
      const channels = this.getChannelStatuses();
      for (const fn of this.channelStatusListeners) fn(channels);
    });
  }

  getStatus(): WsStatus {
    const vals = [...this.channelStatuses.values()];
    if (vals.length === 0) return "connecting";
    if (vals.some((s) => s === "reconnecting")) return "reconnecting";
    if (vals.some((s) => s === "closed")) return "closed";
    if (vals.some((s) => s === "connecting")) return "connecting";
    return "open";
  }

  subscribeStatus(fn: (s: WsStatus) => void): () => void {
    fn(this.getStatus());
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  getChannelStatuses(): ChannelStatuses {
    return {
      worktree: this.channelStatuses.get(WS_URLS.worktree) ?? "connecting",
      central: this.channelStatuses.get(WS_URLS.central) ?? "connecting",
    };
  }

  subscribeChannelStatuses(fn: (s: ChannelStatuses) => void): () => void {
    fn(this.getChannelStatuses());
    this.channelStatusListeners.add(fn);
    return () => this.channelStatusListeners.delete(fn);
  }

  destroy(): void {
    this.unsubscribeFromBus();
  }

  /** Observer count increased for (key, params). Sub on 0→1. */
  observe(
    key: string,
    params: ResourceParams = {},
    origin?: ResourceOrigin,
    schema?: ZodType<unknown>,
  ): void {
    if (schema) this.schemas.set(key, schema);
    const kind = socketKindFor(origin);
    const channel = this.channels[kind];
    const id = `${key}\0${paramsKey(params)}`;
    const existing = channel.subs.get(id);
    if (existing) {
      existing.refcount++;
      return;
    }
    channel.subs.set(id, { refcount: 1, key, params, version: 0, socket: kind });
    this.sendSub(channel, key, params);
  }

  /** Observer count decreased. Unsub on 1→0. */
  unobserve(key: string, params: ResourceParams = {}, origin?: ResourceOrigin): void {
    const kind = socketKindFor(origin);
    const channel = this.channels[kind];
    const id = `${key}\0${paramsKey(params)}`;
    const existing = channel.subs.get(id);
    if (!existing) return;
    existing.refcount--;
    if (existing.refcount > 0) return;
    channel.subs.delete(id);
    channel.ws.send(JSON.stringify({ op: "unsub", key, params }));
  }

  private openChannel(kind: SocketKind): SocketChannel {
    const channel: SocketChannel = {
      ws: new SharedWebSocket(WS_URLS[kind]),
      subs: new Map(),
    };
    channel.ws.onopen = () => this.replaySubs(channel);
    channel.ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.handleServerMessage(channel, msg);
    };
    return channel;
  }

  private replaySubs(channel: SocketChannel): void {
    // Fresh connection means the server has no record of our subs. Reset
    // local versions so a new sub-ack (which will come with a possibly lower
    // version if the server process restarted) isn't dropped as stale.
    for (const sub of channel.subs.values()) {
      sub.version = 0;
      this.sendSub(channel, sub.key, sub.params);
    }
  }

  private sendSub(channel: SocketChannel, key: string, params: ResourceParams): void {
    channel.ws.send(
      JSON.stringify({ op: "sub", id: this.nextMsgId++, key, params }),
    );
  }

  private handleServerMessage(channel: SocketChannel, msg: ServerMsg): void {
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
      this.applyUpdate(channel, msg.key, msg.params, msg.value, msg.version);
      return;
    }
    if (msg.kind === "invalidate") {
      this.applyInvalidate(channel, msg.key, msg.params, msg.version);
      return;
    }
  }

  private applyUpdate(
    channel: SocketChannel,
    key: string,
    params: ResourceParams,
    value: unknown,
    version: number,
  ): void {
    const id = `${key}\0${paramsKey(params)}`;
    const entry = channel.subs.get(id);
    if (entry) {
      if (version <= entry.version) return;
      entry.version = version;
    }
    const schema = this.schemas.get(key);
    if (!schema) {
      throw new Error(
        `[notifications] no schema registered for key="${key}". ` +
          `useResource must observe the descriptor (which carries the schema) ` +
          `before any update can be applied.`,
      );
    }
    this.queryClient.setQueryData(queryKeyFor(key, params), schema.parse(value));
  }

  private applyInvalidate(
    channel: SocketChannel,
    key: string,
    params: ResourceParams,
    version: number,
  ): void {
    const id = `${key}\0${paramsKey(params)}`;
    const entry = channel.subs.get(id);
    if (entry) {
      if (version <= entry.version) return;
      entry.version = version;
    }
    void this.queryClient.invalidateQueries({ queryKey: queryKeyFor(key, params) });
  }
}
