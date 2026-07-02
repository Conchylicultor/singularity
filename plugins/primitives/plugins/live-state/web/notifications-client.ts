import type { QueryClient } from "@tanstack/react-query";
import type { ZodType } from "zod";
import {
  SharedWebSocket,
  subscribeWsStatus,
  subscribeNetDiag,
  type WsStatus,
  type NetDiagEvent,
} from "@plugins/primitives/plugins/networking/web";
import { clientLog } from "@plugins/primitives/plugins/log-channels/web";
import { getTabId } from "@plugins/primitives/plugins/tab-id/web";
import type { ResourceOrigin } from "../core/resource";
import { mergeKeyedDelta } from "./keyed-delta-merge";

// Per-hop persistent tracing for the live-state update pipeline (Layer 1). All
// lines route to the `live-state` log channel over plain HTTP via clientLog —
// decoupled from the notifications WS, so traces still flush even when the WS
// pipeline this watches is wedged. Each line is stamped with the tab id so a
// multi-tab leader/follower trail is attributable.
//
// Always-on lines are low-volume (transitions and silent-drop anomalies — the
// exact failure signatures). The per-frame successful apply is high-volume and
// gated behind a dev-only localStorage flag (see verboseTraceOn).
function trace(line: string): void {
  clientLog("live-state", `[${getTabId()}] ${line}`);
}

// Dev-only verbose toggle for the high-volume per-apply trace. Read straight
// from localStorage (no config_v2 server plumbing for a debug switch). Wrapped
// for SSR / denied-storage safety.
function verboseTraceOn(): boolean {
  try {
    return localStorage.getItem("liveState.verboseTrace") === "1";
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch {
    return false;
  }
}

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

// After the last observer of a (key,params) leaves, keep its WS subscription
// alive briefly so a transient unmount→remount (list virtualization, streaming
// rows that filter in/out) reuses the live sub instead of churning a
// unsub→resub round-trip. Mirrors TanStack Query's gcTime, which keeps the
// cache entry alive on the same principle (use-resource.ts relies on that for
// the value; this aligns the WS sub lifetime with it). This is a one-shot
// deferred-cleanup timer, NOT a polling loop — it checks nothing on a schedule.
const SUB_KEEPALIVE_MS = 30_000;

type SocketKind = keyof typeof WS_URLS;

export type ChannelStatuses = { worktree: WsStatus; central: WsStatus };

/** Live-state pipeline socket kind, as classified from a ws-status-bus url. */
export type LiveStateSocketKind = SocketKind;

/**
 * Classify a ws-status-bus url as a live-state pipeline socket, or return null
 * if it belongs to some other socket (logs, terminal, build) that merely shares
 * the global status bus. This is the single source of truth for "which sockets
 * are the live-state pipeline" — both this client's own bus filter and the
 * health watchdog gate on it, so an unrelated socket's downtime is never
 * mis-attributed to live-state.
 */
export function liveStateSocketKind(url: string): LiveStateSocketKind | null {
  for (const kind of Object.keys(WS_URLS) as SocketKind[]) {
    if (url === WS_URLS[kind]) return kind;
  }
  return null;
}

function socketKindFor(origin: ResourceOrigin | undefined): SocketKind {
  return origin === "central" ? "central" : "worktree";
}

type ResourceParams = Record<string, string>;

export interface ResourceKey {
  key: string;
  params?: ResourceParams;
}

/**
 * A resource HTTP GET returned a non-2xx status. Typed so callers can classify
 * it: `useResource`'s `queryFn` lets it propagate to `q.error`, while the
 * cold-start prime swallows it (the WS sub-ack is the source of truth) — both
 * distinct from a schema/parse failure, which is always a real bug surfaced
 * loudly.
 */
export class ResourceHttpError extends Error {
  constructor(
    public readonly key: string,
    public readonly status: number,
  ) {
    super(`Resource ${key} fetch failed: ${status}`);
    this.name = "ResourceHttpError";
  }
}

type ServerMsg =
  // `etag` (conditional revalidation): the fresh content signature accompanying a
  // full value. Present only for a resource that declares `revalidate`; the client
  // stores it and sends it back on its next (re)subscribe / conditional GET.
  | { kind: "sub-ack"; id?: number; key: string; params: ResourceParams; value: unknown; version: number; etag?: string }
  | { kind: "update"; key: string; params: ResourceParams; value: unknown; version: number; etag?: string }
  | { kind: "delta"; key: string; params: ResourceParams; upserts: [string, unknown][]; deletes: string[]; order?: string[]; version: number }
  | { kind: "invalidate"; key: string; params: ResourceParams; version: number }
  // "your cached value is still current" — the WS analogue of HTTP 304. Carries no
  // value: the client keeps its cached value and only adopts `version` (so a later
  // real update isn't stale-dropped), treating the (re)subscribe as acked.
  | { kind: "up-to-date"; id?: number; key: string; params: ResourceParams; version: number }
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
  /**
   * Highest server version (state-change count) this sub has applied. `-1` =
   * nothing applied yet — the baseline a fresh or replayed sub starts from, so
   * the first sub-ack always passes the `<=` staleness guard (including a
   * never-notified resource's version-0 sub-ack). The server bumps the version
   * only on a real notify, never on (re)subscribe. Both `lastAckVersion` and
   * `liveFrameSeq` below are derived from this stream and are what the missed-
   * update watchdog (`probeMissedUpdates`) actually reads.
   */
  version: number;
  /**
   * Version delivered by the most recent `sub-ack` (server truth at the moment
   * of (re)subscribe). Distinct from `version`, which a live `update` frame also
   * advances — `lastAckVersion` moves *only* on a sub-ack. `probeMissedUpdates`
   * compares this (not `version`) against the pre-resync baseline so a live
   * frame arriving during the settle window can't masquerade as a missed one.
   * `-1` = no ack applied since the last (re)subscribe.
   */
  lastAckVersion: number;
  /**
   * Monotonic count of live, server-initiated frames applied — `update`/`delta`/
   * `invalidate`, never `sub-ack`. Never reset. `probeMissedUpdates` diffs it
   * across the probe: if it advanced, a live frame landed during the window, so
   * any version gap is healthy delivery, not a miss.
   */
  liveFrameSeq: number;
  socket: SocketKind;
  /** ms epoch of the last applyUpdate/applyDelta write for this sub (0 = never). */
  lastAppliedAt: number;
  /**
   * Last-known conditional-revalidation ETag (content signature) for this
   * (key, params), stored from any `sub-ack`/`update` frame that carried one.
   * Sent back on the next `sub` so the server can answer `up-to-date` (keep the
   * cached value) instead of re-running the loader. Preserved across reconnect
   * (`replaySubs`) — that is what makes the post-restart resubscribe cheap.
   * Undefined for a resource that has not opted into revalidation, or before the
   * first value arrives. Cleared when the cached base is lost (a delta with no
   * base / drift) so recovery forces a full reload, never a stale `up-to-date`.
   */
  etag?: string;
}

/** One entry per active sub returned by `debugSnapshot()` (Layer 2 inspector). */
export interface DebugSub {
  key: string;
  paramsKey: string;
  version: number;
  lastAppliedAt: number;
  refcount: number;
  socket: SocketKind;
}

/** Push-based introspection payload for the live-state-health inspector. */
export interface DebugSnapshot {
  subs: DebugSub[];
  sockets: ChannelStatuses;
  leader: { worktree: LeaderInfo; central: LeaderInfo };
}

export interface LeaderInfo {
  isLeader: boolean;
  hasLeader: boolean;
}

/** One genuinely-missed sub returned by `probeMissedUpdates()` (watchdog). */
export interface MissedFrame {
  key: string;
  params: ResourceParams;
  socket: SocketKind;
  /** Version this tab had applied before the probe's forced resync. */
  prevVersion: number;
  /** Higher version the resync sub-ack revealed — the frames we missed. */
  ackVersion: number;
}

interface SocketChannel {
  ws: SharedWebSocket;
  /** (key, paramsKey) -> subscription state for subs routed to this socket. */
  subs: Map<string, ActiveSub>;
  /**
   * (key, paramsKey) -> pending deferred-teardown timer. An entry lives here
   * only while a refcount-0 sub is inside its SUB_KEEPALIVE_MS gc window: a
   * resurrecting observe() cancels it, otherwise the timer fires and tears the
   * sub down. Keyed by the same `${key}\0${paramsKey}` id as `subs`.
   */
  pendingTeardown: Map<string, ReturnType<typeof setTimeout>>;
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
  /** Fired on any sub/version/socket/leader change for the Layer-2 inspector. */
  private debugListeners = new Set<() => void>();
  private unsubscribeFromBus: () => void;
  /**
   * `performance.now()` timestamp the live-state transport FIRST reached the
   * aggregate `"open"` status (null until then). This is the cold-start marker:
   * a resource that mounts before this is set waited on transport bring-up for
   * (at least part of) its settle window, so its mount→first-data duration is
   * time-to-first-data over the transport, not the resource's own compute cost.
   * Set once, never reset — a later reconnect does not re-arm cold-start.
   */
  private firstReadyAt: number | null = null;
  /**
   * Per-channel twin of `firstReadyAt`: the worktree and central sockets are
   * independent, so a worktree resource's cold-start decision must not hinge on
   * the central channel's readiness (or vice-versa). Stamped the first instant
   * each channel's own url reaches "open"; read by `hasEverBeenReady(origin)`.
   * One-way latch per kind — never reset on a later reconnect.
   */
  private firstReadyByKind: Record<SocketKind, number | null> = { worktree: null, central: null };

  constructor(private queryClient: QueryClient) {
    this.channels = {
      worktree: this.openChannel("worktree"),
      central: this.openChannel("central"),
    };
    this.unsubscribeFromBus = subscribeWsStatus(({ url, status }) => {
      const kind = liveStateSocketKind(url);
      if (kind === null) return;
      this.channelStatuses.set(url, status);
      // Stamp the first instant THIS channel reached "open" (per-origin cold-
      // start latch; see `firstReadyByKind`). Written once per kind, never
      // re-armed — read by `hasEverBeenReady(origin)`.
      if (status === "open" && this.firstReadyByKind[kind] === null) {
        this.firstReadyByKind[kind] = performance.now();
      }
      const next = this.getStatus();
      // Stamp the first instant the aggregate transport reached "open" (cold-
      // start marker; see `firstReadyAt`). Written once, never re-armed.
      if (next === "open" && this.firstReadyAt === null) {
        this.firstReadyAt = performance.now();
      }
      for (const fn of this.statusListeners) fn(next);
      const channels = this.getChannelStatuses();
      for (const fn of this.channelStatusListeners) fn(channels);
      this.emitDebug();
    });
    // Net-diag forwarder: the networking layer publishes socket/election
    // transitions to an event bus (it must not depend on log-channels — that
    // would form networking ↔ log-channels). Forward every event to the trace
    // channel here, where importing clientLog is legal. The client is a module
    // singleton, so this single constructor-time subscription never needs
    // teardown and is never double-mounted.
    subscribeNetDiag((ev: NetDiagEvent) => {
      trace(`net-diag ${JSON.stringify(ev)}`);
      this.emitDebug();
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

  /**
   * `performance.now()` of the first moment the transport reached `"open"`, or
   * null if it has never been ready yet. Used by `useResource` to attribute a
   * cold-start resource settle to transport bring-up rather than the resource.
   */
  getFirstReadyAt(): number | null {
    return this.firstReadyAt;
  }

  /** Has the transport for this origin's channel EVER reached "open"? A one-way
   *  latch (never reset) used by useResource to decide whether a cold-start HTTP
   *  prime is warranted. */
  hasEverBeenReady(origin?: ResourceOrigin): boolean {
    return this.firstReadyByKind[socketKindFor(origin)] !== null;
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

  // --- Layer 2/3 introspection + control API --------------------------------

  /**
   * Probe for live frames silently missed while the tab was hidden. Forces a
   * resync of every active sub (reuses the reconnect `replaySubs` path — also a
   * cheap stale-cache self-heal), waits `settleMs` for the sub-acks to land, then
   * returns only the subs that were genuinely behind.
   *
   * A sub is a genuine miss iff all three hold:
   *  - it had a baseline before the probe (`prevVersion >= 0`),
   *  - its resync sub-ack revealed a higher server version
   *    (`lastAckVersion > prevVersion`) — the gap, AND
   *  - no live frame landed for it during the probe (`liveFrameSeq` unchanged) —
   *    so the advance was revealed *only* by the ack, not delivered live.
   *
   * Comparing the sub-ack version (not the running `version`) excludes any live
   * frame that arrives during the settle window; the `liveFrameSeq` guard closes
   * the residual ~1-RTT race where a notify lands between the re-sub and its ack.
   */
  async probeMissedUpdates(settleMs = 1_500): Promise<MissedFrame[]> {
    const before: {
      id: string;
      socket: SocketKind;
      prevVersion: number;
      prevLiveSeq: number;
    }[] = [];
    for (const [kind, channel] of Object.entries(this.channels) as [SocketKind, SocketChannel][]) {
      for (const [id, sub] of channel.subs) {
        before.push({ id, socket: kind, prevVersion: sub.version, prevLiveSeq: sub.liveFrameSeq });
      }
    }
    if (before.length === 0) return [];
    trace(`probeMissedUpdates subCount=${before.length}`);
    for (const channel of Object.values(this.channels)) {
      // Load-bearing: the probe resets lastAckVersion then reads it after a
      // fixed settle; a staggered late-batch sub would still read -1 and hide a
      // genuine miss. The probe is a single-tab watchdog, not the fleet herd.
      this.replaySubs(channel, { stagger: false });
    }
    // One-shot wait for the sub-ack round-trip — not a poll. The ack landing is
    // what `lastAckVersion` captures.
    await new Promise<void>((resolve) => setTimeout(resolve, settleMs));

    const missed: MissedFrame[] = [];
    for (const b of before) {
      // Re-look up by id: a refcount-0 sub may have torn down mid-probe.
      const sub = this.channels[b.socket].subs.get(b.id);
      if (!sub) continue;
      if (
        b.prevVersion >= 0 &&
        sub.lastAckVersion > b.prevVersion &&
        sub.liveFrameSeq === b.prevLiveSeq
      ) {
        missed.push({
          key: sub.key,
          params: sub.params,
          socket: sub.socket,
          prevVersion: b.prevVersion,
          ackVersion: sub.lastAckVersion,
        });
      }
    }
    return missed;
  }

  /**
   * Push-based snapshot of all active subs plus socket + leader state, for the
   * live-state-health inspector. Pair with `subscribeDebug` to re-render on
   * change.
   */
  debugSnapshot(): DebugSnapshot {
    const subs: DebugSub[] = [];
    for (const channel of Object.values(this.channels)) {
      for (const [id, sub] of channel.subs) {
        subs.push({
          key: sub.key,
          paramsKey: id.slice(id.indexOf("\0") + 1),
          version: sub.version,
          lastAppliedAt: sub.lastAppliedAt,
          refcount: sub.refcount,
          socket: sub.socket,
        });
      }
    }
    return {
      subs,
      sockets: this.getChannelStatuses(),
      leader: {
        worktree: this.leaderInfo("worktree"),
        central: this.leaderInfo("central"),
      },
    };
  }

  /** Fires whenever a sub/version/socket/leader state changes. */
  subscribeDebug(listener: () => void): () => void {
    this.debugListeners.add(listener);
    return () => this.debugListeners.delete(listener);
  }

  private leaderInfo(kind: SocketKind): LeaderInfo {
    const ws = this.channels[kind].ws;
    return { isLeader: ws.isLeader, hasLeader: ws.hasLeader };
  }

  private emitDebug(): void {
    for (const fn of this.debugListeners) fn();
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
    const pk = paramsKey(params);
    const id = `${key}\0${pk}`;
    const existing = channel.subs.get(id);
    if (existing) {
      // Resurrection: a refcount-0 sub still inside its keep-alive window is
      // alive again with zero WS traffic — cancel the pending teardown. This is
      // a pure refcount bump, not a transition, so the always-on trace stays
      // silent (only emitDebug fires, to keep the health inspector accurate).
      const pending = channel.pendingTeardown.get(id);
      if (pending !== undefined) {
        clearTimeout(pending);
        channel.pendingTeardown.delete(id);
      }
      existing.refcount++;
      this.emitDebug();
      return;
    }
    channel.subs.set(id, { refcount: 1, key, params, version: -1, lastAckVersion: -1, liveFrameSeq: 0, socket: kind, lastAppliedAt: 0 });
    trace(`observe key=${key} params=${pk} refcount=1`);
    this.sendSub(channel, key, params);
    this.emitDebug();
  }

  /** Observer count decreased. Unsub on 1→0. */
  unobserve(key: string, params: ResourceParams = {}, origin?: ResourceOrigin): void {
    const kind = socketKindFor(origin);
    const channel = this.channels[kind];
    const pk = paramsKey(params);
    const id = `${key}\0${pk}`;
    const existing = channel.subs.get(id);
    if (!existing) return;
    existing.refcount--;
    if (existing.refcount > 0) {
      // Pure refcount decrement, not a transition: stay silent on the always-on
      // trace (emitDebug keeps the health inspector accurate).
      this.emitDebug();
      return;
    }
    // Last observer left: defer the WS unsub by one keep-alive window so a
    // transient remount reuses the live sub. The sub stays in `channel.subs`
    // with refcount 0 until the timer fires (or a resurrecting observe() cancels
    // it). One-shot deferred cleanup — see SUB_KEEPALIVE_MS; not a poll.
    trace(`unobserve key=${key} params=${pk} refcount=0 keepAliveMs=${SUB_KEEPALIVE_MS}`);
    this.emitDebug();
    const timer = setTimeout(() => {
      const sub = channel.subs.get(id);
      // Resurrected (refcount back above 0) between scheduling and firing, or
      // already torn down — just drop the stale timer entry and do nothing.
      if (!sub || sub.refcount > 0) {
        channel.pendingTeardown.delete(id);
        return;
      }
      channel.subs.delete(id);
      channel.pendingTeardown.delete(id);
      channel.ws.send(JSON.stringify({ op: "unsub", key, params }));
      trace(`teardown key=${key} params=${pk}`);
      this.emitDebug();
    }, SUB_KEEPALIVE_MS);
    channel.pendingTeardown.set(id, timer);
  }

  // --- Conditional-revalidation ETag accessors (HTTP fallback path) -----------

  /**
   * Last-known ETag for (key, params) on its channel, so `useResource`'s HTTP
   * fallback can send `If-None-Match` and get a `304` for an unchanged resource
   * instead of recomputing the loader. Undefined when the resource hasn't opted
   * in or no value has arrived yet.
   */
  etagFor(key: string, params: ResourceParams = {}, origin?: ResourceOrigin): string | undefined {
    const channel = this.channels[socketKindFor(origin)];
    return channel.subs.get(`${key}\0${paramsKey(params)}`)?.etag;
  }

  /**
   * Store the ETag from an HTTP GET's `ETag` response header onto the live sub
   * entry, so the next conditional GET / resubscribe can send it. No-op when the
   * header is absent (resource didn't opt in) or no sub exists yet (a fetch that
   * raced ahead of observe() — the etag is then captured on the next GET / the WS
   * sub-ack).
   */
  noteHttpEtag(
    key: string,
    params: ResourceParams = {},
    origin: ResourceOrigin | undefined,
    etag: string | null,
  ): void {
    if (etag == null) return;
    const sub = this.channels[socketKindFor(origin)].subs.get(`${key}\0${paramsKey(params)}`);
    if (sub) sub.etag = etag;
  }

  /** Current cached value for (key, params) — read by the HTTP 304 keep-cache path. */
  getCachedResource(key: string, params: ResourceParams = {}): unknown {
    return this.queryClient.getQueryData(queryKeyFor(key, params));
  }

  /**
   * THE single HTTP resource-cache write path. Fetches a resource's `{ value,
   * version }` over plain HTTP (conditional `If-None-Match`/304) and writes it
   * through the SAME version guard as WS frames, so a late HTTP response can
   * never clobber a newer WS value. Returns the EFFECTIVE cached value — the
   * freshly-applied one, or the retained value on a `304`/stale drop — so React
   * Query's `queryFn` contract holds (data returned, `dataUpdatedAt` bumps,
   * `pending` flips) with no separate render path.
   *
   * Guard uses strict `<` (not the WS path's `<=`): an HTTP GET REPORTS the
   * server's version counter without bumping it, so a legitimate response can
   * EQUAL the version we already applied (the normal `invalidate`-mode refetch:
   * the `invalidate` frame advanced us to `N`, the refetch GET returns `N`). `<`
   * accepts that equal version (a no-op write for push/keyed via structural
   * sharing) while still dropping a genuinely-stale older read.
   *
   * Throws on network (`fetch` `TypeError`), HTTP status (`ResourceHttpError`),
   * or schema/parse failure — callers choose how to surface each.
   */
  async fetchOverHttp<T>(
    key: string,
    params: ResourceParams,
    origin: ResourceOrigin | undefined,
    schema: ZodType<T>,
    source: "prime" | "fallback",
  ): Promise<T> {
    const entry = this.channels[socketKindFor(origin)].subs.get(`${key}\0${paramsKey(params)}`);
    const qs = new URLSearchParams(params).toString();
    const base = origin === "central" ? "/api/central-resources" : "/api/resources";
    const url = `${base}/${encodeURIComponent(key)}${qs ? `?${qs}` : ""}`;
    const etag = this.etagFor(key, params, origin);
    let res = await fetch(url, etag !== undefined ? { headers: { "If-None-Match": etag } } : undefined);
    if (res.status === 304) {
      const cached = this.getCachedResource(key, params);
      // "Still current" — keep the cached value (same reference; structural
      // sharing sees no change).
      if (cached !== undefined) return cached as T;
      // Defensive: 304 with no cached base (shouldn't happen — we only send an
      // ETag when we hold a value). Re-fetch unconditionally so a needless 304
      // never leaves the cache empty, then fall through to the write path.
      res = await fetch(url);
    }
    if (!res.ok) throw new ResourceHttpError(key, res.status);
    const body = (await res.json()) as { value: unknown; version: number };
    this.noteHttpEtag(key, params, origin, res.headers.get("ETag"));
    // Version guard — same discipline as handleServerMessage, but strict `<`
    // (see doc comment). Drop only a response strictly older than the value we
    // already hold, keeping the newer cached value.
    const cached = this.getCachedResource(key, params);
    if (entry && cached !== undefined && body.version < entry.version) {
      trace(`http drop key=${key} params=${paramsKey(params)} msgVersion=${body.version} haveVersion=${entry.version} reason=stale-version source=${source}`);
      return cached as T;
    }
    const parsed = schema.parse(body.value); // schema violation throws — surfaced by the caller
    this.queryClient.setQueryData(queryKeyFor(key, params), parsed);
    if (entry) {
      // Advance monotonically (never lower) so a later WS frame at this version
      // is stale-dropped cheaply and a genuinely-newer one still applies.
      if (body.version > entry.version) entry.version = body.version;
      this.markApplied(entry, key); // stamps lastAppliedAt + emitDebug + verbose trace
    }
    trace(`http key=${key} params=${paramsKey(params)} version=${body.version} source=${source}`);
    return parsed;
  }

  /** Cold-start accelerator: prime a resource's first value over plain HTTP when
   *  the notifications transport isn't ready yet. Delegates to the shared
   *  version-guarded `fetchOverHttp`; best-effort — the WS sub-ack remains the
   *  source of truth. A transient network / HTTP-status failure is swallowed
   *  (the WS will deliver); a schema/parse failure is a real bug surfaced loudly
   *  (mirroring the WS `onmessage` discipline). Never rejects (safe to `void`). */
  async primeFromHttp(key: string, params: ResourceParams = {}, origin?: ResourceOrigin): Promise<void> {
    const entry = this.channels[socketKindFor(origin)].subs.get(`${key}\0${paramsKey(params)}`);
    if (!entry) return; // observe() must have created the sub
    const schema = this.schemas.get(key);
    if (!schema) return;
    try {
      await this.fetchOverHttp(key, params, origin, schema, "prime");
    } catch (err) {
      if (err instanceof TypeError || err instanceof ResourceHttpError) {
        // Transient network / HTTP-status failure during cold boot — non-fatal;
        // the WS sub-ack remains the source of truth and will deliver.
        trace(`http drop key=${key} params=${paramsKey(params)} reason=${err instanceof TypeError ? "network" : "http"} source=prime error=${String(err)}`);
        return;
      }
      // Schema violation / malformed body is a real bug — surface loudly like the
      // WS onmessage path, without rejecting this promise.
      trace(`http error key=${key} params=${paramsKey(params)} source=prime error=${String(err)}`);
      queueMicrotask(() => { throw err; });
    }
  }

  private openChannel(kind: SocketKind): SocketChannel {
    const channel: SocketChannel = {
      ws: new SharedWebSocket(WS_URLS[kind]),
      subs: new Map(),
      pendingTeardown: new Map(),
    };
    channel.ws.onopen = () => this.replaySubs(channel);
    channel.ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data);
      } catch (err) {
        if (!(err instanceof SyntaxError)) throw err;
        trace(`drop reason=parse-error error=${String(err)}`);
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
        trace(`drop reason=parse-error key=${msg.kind === "ping" ? "ping" : (msg as { key?: string }).key ?? "?"} error=${String(err)}`);
        queueMicrotask(() => {
          throw err;
        });
      }
    };
    return channel;
  }

  /**
   * Resend all of a channel's subs after a fresh connection (the server has no
   * record of our subs). Per sub, reset local versions to the -1 "nothing
   * applied yet" baseline so the next sub-ack always applies — even a
   * never-notified resource's version-0 sub-ack, and even a lower version after
   * a server restart reset its counters.
   *
   * Subs in their keep-alive window (refcount 0, still in `channel.subs`) are
   * resent here too. That's intentional and harmless: their pendingTeardown
   * timer still fires and tears them down on schedule, independent of reconnect.
   *
   * `stagger` (default `true`): a shared backend restart reconnects the whole
   * tab fleet at once, and each tab would otherwise dump all ~30 cold sub-ack
   * loads in one microtask — the herd amplitude that saturates the per-backend
   * DB loader gate. Staggering fans the resends out in small batches over a
   * bounded window so the fleet's cold-recompute load is spread, not spiked.
   *
   * The **probe** (`probeMissedUpdates`) passes `stagger: false`: it resets
   * `lastAckVersion = -1`, waits a fixed `settleMs`, then reads `lastAckVersion`
   * to detect genuine misses. A staggered late-batch sub would still read `-1`
   * when the timer fires → a real miss goes undetected. The probe is a
   * single-tab watchdog, not part of the fleet herd, so it must stay synchronous.
   */
  private replaySubs(channel: SocketChannel, opts: { stagger?: boolean } = {}): void {
    const stagger = opts.stagger ?? true;
    trace(`replaySubs socket=${channel === this.channels.central ? "central" : "worktree"} subCount=${channel.subs.size} stagger=${stagger}`);

    // CRITICAL: reset `version`/`lastAckVersion` to -1 AND `sendSub` TOGETHER,
    // per-sub, at that sub's send time — never reset all up front. The server
    // holds no sub state until `sendSub` actually goes out, so a not-yet-resent
    // sub must keep its live baseline until its own batch fires (otherwise a
    // frame arriving for a still-un-resent sub would be dropped against a -1
    // baseline that no server sub-ack has answered yet).
    const resend = (sub: ActiveSub): void => {
      sub.version = -1;
      // The next sub-ack is the fresh baseline. Clear it so a stale pre-resync
      // ack can't be read as the resync's (liveFrameSeq is a monotonic counter
      // and is never reset).
      sub.lastAckVersion = -1;
      // Deliberately KEEP `sub.etag`: it's the whole point of conditional
      // revalidation. The resend below carries it so an unchanged resource gets a
      // cheap `up-to-date` (keep cache) instead of a full loader — collapsing the
      // post-restart resubscribe herd. The cached TanStack value survives the
      // reconnect (the socket dropped, not the page), so the etag still describes
      // a value we actually hold.
      this.sendSub(channel, sub.key, sub.params);
    };

    if (!stagger) {
      for (const sub of channel.subs.values()) resend(sub);
      this.emitDebug();
      return;
    }

    // Snapshot the sub list so concurrent mutation (teardown / new observe)
    // during the staggered window is well-defined.
    const subs = [...channel.subs.values()];
    if (subs.length === 0) {
      this.emitDebug();
      return;
    }

    // Batch the resends: ~6 subs per batch, one batch every ~150ms, with the
    // total spread capped at ~2.5s regardless of sub count. If there are more
    // subs than `maxBatches * baseBatchSize`, grow the batch size so the last
    // batch still fires within the cap (a huge sub count never stretches to
    // tens of seconds). The setTimeout timers are fire-and-forget (they return
    // a timer, not a promise) — the sanctioned pattern here, same as the
    // SUB_KEEPALIVE_MS teardown below.
    const BASE_BATCH_SIZE = 6;
    const BATCH_DELAY_MS = 150;
    const MAX_SPREAD_MS = 2_500;
    const maxBatches = Math.floor(MAX_SPREAD_MS / BATCH_DELAY_MS) + 1;
    const batchSize = Math.max(BASE_BATCH_SIZE, Math.ceil(subs.length / maxBatches));

    for (let start = 0, batch = 0; start < subs.length; start += batchSize, batch++) {
      const slice = subs.slice(start, start + batchSize);
      setTimeout(() => {
        for (const sub of slice) resend(sub);
        this.emitDebug();
      }, batch * BATCH_DELAY_MS);
    }
  }

  private sendSub(channel: SocketChannel, key: string, params: ResourceParams): void {
    const socket = channel === this.channels.central ? "central" : "worktree";
    // Attach the sub's last-known ETag (if any) so the server can answer
    // `up-to-date` instead of re-running the loader. Read off the live sub entry
    // so every caller (fresh observe with no etag, reconnect replay with a
    // preserved one, delta-recovery resub that cleared it) sends the right thing.
    const etag = channel.subs.get(`${key}\0${paramsKey(params)}`)?.etag;
    trace(`sendSub key=${key} params=${paramsKey(params)} socket=${socket}${etag !== undefined ? " etag=1" : ""}`);
    channel.ws.send(
      JSON.stringify({ op: "sub", id: this.nextMsgId++, key, params, ...(etag !== undefined ? { etag } : {}) }),
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
    const pk = paramsKey(msg.params);
    const id = `${msg.key}\0${pk}`;
    const entry = channel.subs.get(id);
    if (!entry) {
      trace(`drop key=${msg.key} params=${pk} version=${msg.version} reason=no-sub`);
      return;
    }
    if (msg.version <= entry.version) {
      trace(`drop key=${msg.key} params=${pk} msgVersion=${msg.version} haveVersion=${entry.version} reason=stale-version`);
      return;
    }
    if (msg.kind === "sub-ack") {
      trace(`sub-ack key=${msg.key} params=${pk} version=${msg.version}`);
    } else if (msg.kind === "up-to-date") {
      trace(`up-to-date key=${msg.key} params=${pk} version=${msg.version}`);
    }
    entry.version = msg.version;
    // Split the two causes of a version advance so the wedge probe can tell them
    // apart: a sub-ack (and its `up-to-date` sibling) carries server truth at
    // (re)subscribe; every other kind is a live, server-initiated frame.
    if (msg.kind === "sub-ack" || msg.kind === "up-to-date") {
      entry.lastAckVersion = msg.version;
    } else {
      entry.liveFrameSeq++;
    }
    // Store the fresh ETag from any full-value frame that carries one, so the next
    // (re)subscribe / conditional GET can be answered `up-to-date`/304.
    if ((msg.kind === "sub-ack" || msg.kind === "update") && msg.etag !== undefined) {
      entry.etag = msg.etag;
    }

    if (msg.kind === "up-to-date") {
      // Conditional-revalidation hit: the server confirmed our cached value is
      // still current. Do NOT touch the TanStack cache — the cached value stays.
      // We already adopted `version`/`lastAckVersion` above (so a later real
      // update isn't stale-dropped and the missed-update watchdog sees a clean
      // ack) and kept the stored etag. Just fire the debug hook.
      this.emitDebug();
      return;
    }

    if (msg.kind === "sub-ack" || msg.kind === "update") {
      this.applyUpdate(entry, msg.key, msg.params, msg.value);
      return;
    }
    if (msg.kind === "delta") {
      this.applyDelta(channel, entry, msg.key, msg.params, msg.upserts, msg.order);
      return;
    }
    // Only remaining case: "invalidate"
    this.applyInvalidate(msg.key, msg.params);
  }

  private applyUpdate(
    entry: ActiveSub,
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
    this.markApplied(entry, key);
  }

  /** Stamp the apply time, fire debug listeners, and emit the verbose-gated apply trace. */
  private markApplied(entry: ActiveSub, key: string): void {
    entry.lastAppliedAt = Date.now();
    if (verboseTraceOn()) {
      trace(`applyUpdate key=${key} params=${paramsKey(entry.params)} version=${entry.version}`);
    }
    this.emitDebug();
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
    entry: ActiveSub,
    key: string,
    params: ResourceParams,
    upserts: [string, unknown][],
    order: string[] | undefined,
  ): void {
    const queryKey = queryKeyFor(key, params);
    // Base-presence guard (load-bearing): never apply a delta onto a missing
    // base. If the cache has no value yet, force a fresh full snapshot.
    if (this.queryClient.getQueryData(queryKey) === undefined) {
      trace(`applyDelta key=${key} params=${paramsKey(params)} reason=delta-no-base-resub`);
      // The cached base is gone — the stored etag describes a value we no longer
      // hold, so clear it to force a FULL sub-ack (never a stale `up-to-date`).
      entry.etag = undefined;
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

    // The base-presence guard above already ensured a non-undefined base.
    const prevRows = (this.queryClient.getQueryData(queryKey) as unknown[]) ?? [];
    const result = mergeKeyedDelta(prevRows, upsertMap, order, keyOf);
    if (result.kind === "drift") {
      // `order` named ids resolvable from neither the upserts nor the cached
      // base — the client's base has drifted behind the server snapshot (a
      // missed/stale-dropped intermediate frame). Writing the rebuild anyway
      // would punch `undefined` holes into the array and crash the next
      // consumer to iterate the rows; instead leave the cache untouched and
      // force a fresh full base.
      trace(
        `applyDelta key=${key} params=${paramsKey(params)} reason=delta-drift-resub ids=${result.missingIds.join(",")}`,
      );
      // Base drifted behind server truth — clear the etag so the recovery sub
      // reloads a full base rather than being told `up-to-date` (keep the drift).
      entry.etag = undefined;
      this.sendSub(channel, key, params);
      return;
    }
    this.queryClient.setQueryData(queryKey, result.rows);
    this.markApplied(entry, key);
  }

  private applyInvalidate(key: string, params: ResourceParams): void {
    void this.queryClient.invalidateQueries({ queryKey: queryKeyFor(key, params) });
  }
}
