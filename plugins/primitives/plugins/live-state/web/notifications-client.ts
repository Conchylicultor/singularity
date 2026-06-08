import type { QueryClient } from "@tanstack/react-query";
import type { ZodType } from "zod";
import {
  SharedWebSocket,
  subscribeWsStatus,
  type WsStatus,
} from "@plugins/primitives/plugins/networking/web";
import type { ResourceOrigin } from "../core/resource";

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
  | { kind: "delta"; key: string; params: ResourceParams; upserts: [string, unknown][]; deletes: string[]; order?: string[]; version: number }
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
  /**
   * key → row-identity fn for keyed resources. Registered alongside the schema
   * in observe(). Used by applyDelta to key prior cache rows when merging a
   * delta. Absent for non-keyed resources.
   */
  private keyedKeyOf = new Map<string, (row: unknown) => string>();
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
    keyOf?: (row: unknown) => string,
  ): void {
    if (schema) this.schemas.set(key, schema);
    if (keyOf) this.keyedKeyOf.set(key, keyOf);
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
      } catch (err) {
        if (!(err instanceof SyntaxError)) throw err;
        return;
      }
      try {
        this.handleServerMessage(channel, msg);
      } catch (err) {
        // A schema.parse failure would otherwise silently leave the cache at
        // its empty default. Re-throw asynchronously so the global browser
        // crash reporter observes it as an uncaught error — without importing
        // the crashes plugin (live-state ← crashes would be an import cycle)
        // and without breaking the WS loop for subsequent messages.
        queueMicrotask(() => {
          throw err;
        });
      }
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

    // Every remaining kind (sub-ack/update/delta/invalidate) carries (key,
    // params) and targets a subscription. The shared socket broadcasts *every*
    // server frame to *every* tab (see SharedWebSocket) — so this tab also
    // receives frames for subscriptions only other tabs made. Apply a frame
    // only when THIS tab holds a live subscription for it: a present `entry`
    // means observe() ran here, which registered the schema/keyOf the apply*
    // methods rely on. Without this gate a frame for another tab's resource
    // reaches applyUpdate with no schema registered and throws. The version
    // guard + bump also live here, deduped across all three apply paths.
    const id = `${msg.key}\0${paramsKey(msg.params)}`;
    const entry = channel.subs.get(id);
    if (!entry) return;
    if (msg.version <= entry.version) return;
    entry.version = msg.version;

    if (msg.kind === "sub-ack" || msg.kind === "update") {
      this.applyUpdate(msg.key, msg.params, msg.value);
      return;
    }
    if (msg.kind === "delta") {
      this.applyDelta(channel, msg.key, msg.params, msg.upserts, msg.order);
      return;
    }
    // Only remaining case: "invalidate"
    this.applyInvalidate(msg.key, msg.params);
  }

  private applyUpdate(
    key: string,
    params: ResourceParams,
    value: unknown,
  ): void {
    // Invariant: handleServerMessage only reaches here for a (key) this tab
    // observes, and observe() registers the schema alongside the sub entry — so
    // a missing schema means that contract was violated.
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

  // Merge a row-keyed delta into the cached array. Unchanged rows keep their
  // identical object reference (reused from the prior value via `existingById`),
  // so memoized row components don't re-render — only changed rows get new
  // objects. The new array order is authoritative from the server's `order`.
  // `deletes` is not a parameter: the new array is rebuilt purely from `order`
  // (the authoritative final id list), so deleted ids are implicitly excluded.
  // The server still ships `deletes` on the wire for clarity and Layer 2 reuse.
  private applyDelta(
    channel: SocketChannel,
    key: string,
    params: ResourceParams,
    upserts: [string, unknown][],
    order: string[] | undefined,
  ): void {
    const queryKey = queryKeyFor(key, params);
    // Base-presence guard (load-bearing): never apply a delta onto a missing
    // base. If the cache has no value yet, force a fresh full snapshot.
    if (this.queryClient.getQueryData(queryKey) === undefined) {
      this.sendSub(channel, key, params);
      return;
    }
    const schema = this.schemas.get(key);
    if (!schema) {
      throw new Error(
        `[notifications] no schema registered for key="${key}". ` +
          `useResource must observe the descriptor (which carries the schema) ` +
          `before any update can be applied.`,
      );
    }
    const keyOf = this.keyedKeyOf.get(key);
    if (!keyOf) {
      throw new Error(
        `[notifications] no keyOf registered for keyed resource key="${key}". ` +
          `Use keyedResourceDescriptor so observe() registers the row identity.`,
      );
    }
    // Parse each upsert row individually via the array schema's element — never
    // re-parse the whole array (that's the cost this protocol removes).
    // biome-ignore lint/suspicious/noExplicitAny: zod array schemas expose `.element`.
    const element = (schema as any).element as ZodType<unknown>;
    const upsertMap = new Map<string, unknown>();
    for (const [rowId, row] of upserts) upsertMap.set(rowId, element.parse(row));

    this.queryClient.setQueryData(queryKey, (prev: unknown) => {
      const prevRows = Array.isArray(prev) ? (prev as unknown[]) : [];
      if (order === undefined) {
        // Membership/order unchanged (in-place upserts only): walk the prior
        // array, swapping changed rows by id. No deletes, no new rows. Unchanged
        // rows keep their identical reference — only upserted rows get a new
        // object, preserving the no-re-render-churn property.
        return prevRows.map((row) => upsertMap.get(keyOf(row)) ?? row);
      }
      // Membership/order changed: rebuild from the authoritative `order`,
      // reusing prior row references for unchanged ids.
      const existingById = new Map<string, unknown>();
      for (const row of prevRows) existingById.set(keyOf(row), row);
      return order.map((rowId) => upsertMap.get(rowId) ?? existingById.get(rowId));
    });
  }

  private applyInvalidate(key: string, params: ResourceParams): void {
    void this.queryClient.invalidateQueries({ queryKey: queryKeyFor(key, params) });
  }
}
