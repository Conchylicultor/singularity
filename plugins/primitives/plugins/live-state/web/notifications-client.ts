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
import { noteResourceWatermark } from "./watermark-registry";
import { noteResourceTxAcks } from "./tx-ack-registry";
import { httpStaleDropReportSink } from "./stale-drop-reporter";

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
  // eslint-disable-next-line promise-safety/no-bare-catch, promise-safety/no-absorbed-failure -- SSR / denied-storage safety for a local debug flag; any access failure means "verbose trace off" (return false), the correct default, never a signal to surface
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

/**
 * An HTTP resource GET returned a value the version guard rejected as stale, on
 * a `(key, params)` whose cache holds only the descriptor's placeholder (never a
 * server-vouched value). `fetchOverHttp` throws this rather than settling the
 * query with that placeholder (the "Close (state unknown)" wedge) or applying
 * the stale body (which would render old-boot data). React Query's `retry` plus
 * the next `invalidate` frame converge the legitimate same-epoch race; if the
 * retry also loses, `q.error` settles typed and visible. Swallowed by
 * `primeFromHttp` (prime is best-effort; the WS sub-ack is the source of truth).
 */
export class ResourceStaleReadError extends Error {
  constructor(
    public readonly key: string,
    public readonly bodyVersion: number,
    public readonly haveVersion: number,
    public readonly reason: "stale-version" | "stale-epoch",
  ) {
    super(`Resource ${key} stale read: body v${bodyVersion} vs have v${haveVersion} (${reason})`);
    this.name = "ResourceStaleReadError";
  }
}

type ServerMsg =
  // `etag` (conditional revalidation): the fresh content signature accompanying a
  // full value. Present only for a resource that declares `revalidate`; the client
  // stores it and sends it back on its next (re)subscribe / conditional GET.
  // `epoch` (version short-circuit): the server's boot identity, stamped on every
  // ack frame. Stored per channel and echoed alongside the sub's version on the
  // next replay, so a same-boot server can answer `up-to-date` from its in-memory
  // version counter with no loader run.
  // `watermark` (commit watermark, Rule B′): the xid8 snapshot floor the frame's
  // value was read under. Rides ONLY frames whose value fully reconciles the
  // client — sub-ack, update, and FULL keyed deltas (a SCOPED delta is a partial
  // re-read and never carries one). Adopted into the module-level watermark
  // registry immediately before the cache write it describes, so the optimistic
  // hook can causally compare mutation ack tokens against it.
  // `ackTx` (mutation-ack attribution): the source-transaction ids the frame's
  // recompute folded in — noted into the tx-ack registry immediately before the
  // cache write (value frames), so the optimistic hook's exact-ack confirmation
  // reads them synchronously. Feed-driven frames only; sub-ack/HTTP bodies never
  // carry one (their snapshot watermark subsumes it).
  | { kind: "sub-ack"; id?: number; key: string; params: ResourceParams; value: unknown; version: number; etag?: string; epoch?: string; watermark?: string }
  | { kind: "update"; key: string; params: ResourceParams; value: unknown; version: number; etag?: string; watermark?: string; ackTx?: string[] }
  | { kind: "delta"; key: string; params: ResourceParams; upserts: [string, unknown][]; deletes: string[]; order?: string[]; version: number; watermark?: string; ackTx?: string[] }
  | { kind: "invalidate"; key: string; params: ResourceParams; version: number }
  // Standalone mutation-ack frame (per-resource `ackChannel` opt-in): a
  // recompute produced NO value change (empty scoped diff, net-zero membership,
  // point empty-intersection) but the writer's ack must not hang on it.
  // Version-less, cache-less, idempotent — handled BEFORE the version-guard
  // block, gated on the local sub entry like `sub-error`.
  | { kind: "ack"; key: string; params: ResourceParams; ackTx: string[] }
  // "your cached value is still current" — the WS analogue of HTTP 304. Carries no
  // value: the client keeps its cached value and only adopts `version` (so a later
  // real update isn't stale-dropped), treating the (re)subscribe as acked.
  | { kind: "up-to-date"; id?: number; key: string; params: ResourceParams; version: number; epoch?: string }
  // The batched twin: one frame answering every already-current entry of a
  // `sub-batch` replay. Each entry runs through the exact per-entry `up-to-date`
  // logic (version guard, adoption, lastAckVersion).
  | { kind: "up-to-date-batch"; epoch: string; entries: Array<{ id?: number; key: string; params: ResourceParams; version: number }> }
  // `params` (Fix D): a sub-error now names the exact subscription it failed for,
  // so the client can gate it on a live local sub (the all-tabs fan-out safety)
  // and drive an HTTP-fallback refetch. A pre-upgrade server omits `params`
  // (undefined at runtime); such a legacy frame simply fails the sub gate.
  | { kind: "sub-error"; id?: number; key: string; params: ResourceParams; reason: string }
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
  /**
   * Which server boot `version` belongs to — learned from any epoch-carrying ack
   * frame (`sub-ack` / `up-to-date`). Server versions are per-boot in-memory
   * counters, incomparable across boots; `epoch` labels the boot so
   * `fetchOverHttp`'s guard can tell a same-boot stale read (drop) from a
   * stale-boot cache that a live response should replace (adopt). Undefined until
   * the first ack, or on a pre-epoch server. `update`/`delta`/`invalidate` frames
   * leave it unchanged (they ride the same boot's stream).
   */
  epoch?: string;
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
  /**
   * The server's boot identity, learned from any ack frame carrying `epoch`
   * (`sub-ack` / `up-to-date` / `up-to-date-batch`). Echoed with each sub's
   * version in the replay batch so a same-boot server can short-circuit
   * already-current subs to `up-to-date` — no loader, no read-admission slot.
   * A restart mints a new epoch, so a post-restart replay's stale echo simply
   * takes the full path and re-learns. Undefined until the first ack.
   */
  serverEpoch?: string;
}

export class NotificationsClient {
  // Lazily-populated: the worktree channel is opened eagerly in the constructor,
  // but the central channel is created only when a central-origin resource is
  // first observed (see `channelFor`). An app with no central resources (a
  // self-contained release with `auth` excluded) therefore never opens
  // /ws/central-notifications — a release ships no central runtime, so that
  // socket would otherwise 404 and reconnect forever, pinning the overall status.
  private channels: Partial<Record<SocketKind, SocketChannel>> = {};
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
  /**
   * `${key}\0${paramsKey}` → count of consecutive HTTP stale drops since the last
   * successful apply. Incremented on every `fetchOverHttp` drop (both same-epoch
   * strict-`<` and cross-boot stale-epoch), emitted with the running count to the
   * stale-drop report sink, and reset in `markApplied` (WS or HTTP). A sustained
   * never-applied run is the wedge signature the reports consumer thresholds on.
   */
  private staleDropCounts = new Map<string, number>();
  private channelStatuses = new Map<string, WsStatus>();
  private statusListeners = new Set<(s: WsStatus) => void>();
  private channelStatusListeners = new Set<(s: ChannelStatuses) => void>();
  /** Fired on any sub/version/socket/leader change for the Layer-2 inspector. */
  private debugListeners = new Set<() => void>();
  private unsubscribeFromBus: () => void;
  /** Net-diag bus unsubscriber, captured so `destroy()` can release it (a test
   *  constructs many clients; the module-level bus would otherwise leak). */
  private unsubscribeFromNetDiag: () => void;
  /** Socket factory (injection seam): defaults to a real `SharedWebSocket`; a
   *  test wires one built on fake transports. */
  private makeSocket: (url: string) => SharedWebSocket;
  /** `fetch` implementation (injection seam): defaults to the global `fetch`; a
   *  test wires a scripted one to drive `fetchOverHttp` deterministically. Used
   *  for BOTH the conditional GET and the defensive refetch. Typed as the call
   *  signature only (not `typeof fetch`, which also carries the `preconnect`
   *  static a plain closure lacks). */
  private fetchImpl: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;
  /**
   * This tab's stable id, stamped on every sub/unsub frame so the server can
   * track which tab holds which sub (the per-tab bookkeeping behind `unsub-tab`
   * and the `sub-batch complete:true` reconciliation). Injection seam for tests
   * (two "tabs" in one jsdom page share sessionStorage, so the real getTabId()
   * would collide); production always uses getTabId().
   */
  private tabId: string;
  /** `pagehide` handler (best-effort tab departure), removed in `destroy()`. */
  private pagehideListener: (() => void) | null = null;
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

  constructor(
    private queryClient: QueryClient,
    hooks?: {
      makeSocket?: (url: string) => SharedWebSocket;
      tabId?: string;
      fetchImpl?: typeof fetch;
    },
  ) {
    // Socket factory must be set before channelFor (openChannel reads it).
    this.makeSocket = hooks?.makeSocket ?? ((u) => new SharedWebSocket(u));
    this.fetchImpl = hooks?.fetchImpl ?? ((...a) => fetch(...a));
    this.tabId = hooks?.tabId ?? getTabId();
    // Open the worktree channel eagerly (always used). Central stays lazy —
    // opened on the first central-origin observe() via channelFor.
    this.channelFor("worktree");
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
    // channel here, where importing clientLog is legal. In production the client
    // is a module singleton, so this never needs teardown; the unsubscriber is
    // captured only so `destroy()` (tests) can release the module-level bus.
    this.unsubscribeFromNetDiag = subscribeNetDiag((ev: NetDiagEvent) => {
      trace(`net-diag ${JSON.stringify(ev)}`);
      this.emitDebug();
    });
    // Best-effort tab departure: tell the server to release every sub THIS tab
    // holds, so a closed follower tab's subs stop fanning out immediately
    // instead of leaking until the whole socket cycles. For a follower the send
    // relays to the leader over BroadcastChannel — a fire-and-forget post that
    // usually survives pagehide. Accepted residue: a tab killed without
    // pagehide leaks until the next socket cycle (the pre-existing bound).
    if (typeof window !== "undefined") {
      this.pagehideListener = () => {
        for (const channel of Object.values(this.channels) as SocketChannel[]) {
          channel.ws.send(JSON.stringify({ op: "unsub-tab", tabId: this.tabId }));
        }
      };
      window.addEventListener("pagehide", this.pagehideListener);
    }
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
    for (const channel of Object.values(this.channels) as SocketChannel[]) {
      // Same batch replay as a reconnect: the whole set goes out in ONE
      // synchronous frame (baselines reset at build time), so `lastAckVersion`
      // is -1 before the settle window opens and every ack lands inside it.
      this.replaySubs(channel);
    }
    // One-shot wait for the sub-ack round-trip — not a poll. The ack landing is
    // what `lastAckVersion` captures.
    await new Promise<void>((resolve) => setTimeout(resolve, settleMs));

    const missed: MissedFrame[] = [];
    for (const b of before) {
      // Re-look up by id: a refcount-0 sub may have torn down mid-probe.
      const sub = this.channels[b.socket]?.subs.get(b.id);
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
    for (const channel of Object.values(this.channels) as SocketChannel[]) {
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
    // Read without creating: a never-opened channel (e.g. central on an app with
    // no central resources) has no leader — report it as such, never open it.
    const channel = this.channels[kind];
    if (!channel) return { isLeader: false, hasLeader: false };
    const ws = channel.ws;
    return { isLeader: ws.isLeader, hasLeader: ws.hasLeader };
  }

  private emitDebug(): void {
    for (const fn of this.debugListeners) fn();
  }

  /**
   * Release every resource this client holds. Inert in production (the client is
   * a module singleton, never destroyed); the complete teardown exists so a test
   * leaves no dangling module-level bus subscription, deferred-teardown timer, or
   * open socket to leak into the next test.
   */
  destroy(): void {
    this.unsubscribeFromBus();
    this.unsubscribeFromNetDiag();
    if (this.pagehideListener !== null) {
      window.removeEventListener("pagehide", this.pagehideListener);
      this.pagehideListener = null;
    }
    for (const channel of Object.values(this.channels) as SocketChannel[]) {
      for (const timer of channel.pendingTeardown.values()) clearTimeout(timer);
      channel.pendingTeardown.clear();
      channel.ws.close();
    }
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
    // The ONLY path that may lazily create a channel: the first central-origin
    // observe() opens the central socket; every read-only path below only reads.
    const channel = this.channelFor(kind);
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
    // Read-only: an unobserve can only be reached for an origin a prior observe()
    // already created the channel for. Guard defensively (never create it here).
    const channel = this.channels[kind];
    if (!channel) return;
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
      channel.ws.send(JSON.stringify({ op: "unsub", key, params, tabId: this.tabId }));
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
    // Read-only: reachable only after an observe() created this origin's channel.
    const channel = this.channels[socketKindFor(origin)];
    return channel?.subs.get(`${key}\0${paramsKey(params)}`)?.etag;
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
    // Read-only: reachable only after an observe() created this origin's channel.
    const sub = this.channels[socketKindFor(origin)]?.subs.get(`${key}\0${paramsKey(params)}`);
    if (sub) sub.etag = etag;
  }

  /** Current cached value for (key, params) — read by the HTTP 304 keep-cache path. */
  getCachedResource(key: string, params: ResourceParams = {}): unknown {
    return this.queryClient.getQueryData(queryKeyFor(key, params));
  }

  /**
   * Has a server-vouched value EVER landed in the cache for (key, params)? True
   * iff `dataUpdatedAt` has left epoch 0 — the exact signal `use-resource.ts`
   * reads for its `pending` flag. A descriptor's `initialData` is seeded at
   * `initialDataUpdatedAt: 0`, so a mounted-but-never-applied query reads a
   * non-undefined `getQueryData` (the placeholder) yet `false` here. This is
   * what separates "cache holds newer server truth" (keep it) from "cache holds
   * only the placeholder the server never vouched for" (must not settle with it).
   */
  private hasAppliedValue(key: string, params: ResourceParams): boolean {
    return (this.queryClient.getQueryState(queryKeyFor(key, params))?.dataUpdatedAt ?? 0) !== 0;
  }

  /**
   * THE single HTTP resource-cache write path. Fetches a resource's `{ value,
   * version, epoch?, watermark? }` over plain HTTP (`cache: "no-store"` so the
   * browser cache can never hand back an old-boot body — the poisoning class this
   * closes; conditional `If-None-Match`/304) and writes it through an epoch-aware
   * version guard, so a late or old-boot HTTP response can never clobber a newer
   * WS value. Returns the EFFECTIVE cached value — the freshly-applied one, or the
   * retained value on a `304`/stale drop — so React Query's `queryFn` contract
   * holds (data returned, `dataUpdatedAt` bumps, `pending` flips) with no separate
   * render path.
   *
   * Version guard: server versions are per-`(key,params)` in-memory counters that
   * reset each boot, so a raw comparison is only meaningful WITHIN one boot. When
   * the body carries an `epoch` (its boot identity) and we hold a sub `entry`:
   *   - same boot as `entry` (or `entry` not yet epoch-stamped): strict `<` drop —
   *     an HTTP GET reports the counter without bumping it, so a legitimate
   *     response can EQUAL the version we hold (the normal `invalidate`-mode
   *     refetch), which `<` accepts;
   *   - `entry` is a stale boot but the body matches the live WS server identity:
   *     ADOPT (the live response beats a cached memory of an older boot);
   *   - the body is a stale boot while `entry` matches the live server: DROP
   *     (`stale-epoch`);
   *   - neither matches the live server (the WS-down fallback window): ADOPT — a
   *     live response beats a memory of unknown vintage, and dropping would starve
   *     the fallback this function exists to serve.
   * An epoch-less body (pre-upgrade server) keeps the strict-`<` behavior byte-for-
   * byte. On a cross-epoch adopt the entry's `version`/`epoch` are re-stamped from
   * the body (the old-boot number is meaningless); a same-epoch apply keeps the
   * monotonic bump.
   *
   * On a DROP: if a server-vouched value was ever applied, the cache holds newer
   * truth — return it. Otherwise throw `ResourceStaleReadError` — NEVER settle the
   * query with the descriptor's placeholder (the "Close (state unknown)" wedge)
   * nor apply the stale body (old-boot data under destructive buttons). Every drop
   * also feeds the stale-drop report sink with the running consecutive count.
   *
   * Throws on network (`fetch` `TypeError`), HTTP status (`ResourceHttpError`),
   * stale never-applied read (`ResourceStaleReadError`), or schema/parse failure —
   * callers choose how to surface each.
   */
  async fetchOverHttp<T>(
    key: string,
    params: ResourceParams,
    origin: ResourceOrigin | undefined,
    schema: ZodType<T>,
    source: "prime" | "fallback",
  ): Promise<T> {
    const channel = this.channels[socketKindFor(origin)];
    const entry = channel?.subs.get(`${key}\0${paramsKey(params)}`);
    const serverEpoch = channel?.serverEpoch;
    const qs = new URLSearchParams(params).toString();
    const base = origin === "central" ? "/api/central-resources" : "/api/resources";
    const url = `${base}/${encodeURIComponent(key)}${qs ? `?${qs}` : ""}`;
    const etag = this.etagFor(key, params, origin);
    // `cache: "no-store"` on BOTH fetches: the browser HTTP cache must never
    // store or transparently 304-revalidate a resource body — a restart-stable
    // ETag would otherwise let it replay an old-boot `{value, version}`.
    let res = await this.fetchImpl(
      url,
      etag !== undefined
        ? { cache: "no-store", headers: { "If-None-Match": etag } }
        : { cache: "no-store" },
    );
    if (res.status === 304) {
      const cached = this.getCachedResource(key, params);
      // "Still current" — keep the cached value ONLY when a server-vouched value
      // was actually applied (same reference; structural sharing sees no change).
      // A 304 against a never-applied placeholder must NOT settle the query with
      // it — fall through to the unconditional refetch below.
      if (cached !== undefined && this.hasAppliedValue(key, params)) return cached as T;
      // 304 with only a placeholder (or no base): re-fetch unconditionally so a
      // needless 304 never leaves the cache empty/stale, then take the write path.
      res = await this.fetchImpl(url, { cache: "no-store" });
    }
    if (!res.ok) throw new ResourceHttpError(key, res.status);
    const body = (await res.json()) as { value: unknown; version: number; epoch?: string; watermark?: string };
    this.noteHttpEtag(key, params, origin, res.headers.get("ETag"));

    // Epoch-aware version guard (see doc comment). Compute the adopt/drop decision
    // only when we hold a sub `entry` to compare against; with no entry there is
    // nothing to guard, so apply straight through.
    let drop: "stale-version" | "stale-epoch" | null = null;
    let crossEpochAdopt = false;
    if (entry) {
      if (body.epoch === undefined || body.epoch === entry.epoch || entry.epoch === undefined) {
        // Legacy body OR same boot (or entry not yet epoch-stamped): strict `<`.
        if (body.version < entry.version) drop = "stale-version";
      } else if (body.epoch === serverEpoch) {
        // Entry is a stale boot; body matches the live WS server identity → adopt.
        crossEpochAdopt = true;
      } else if (entry.epoch === serverEpoch) {
        // Body is a stale boot while the entry matches the live server → drop.
        drop = "stale-epoch";
      } else {
        // No arbiter (WS-down fallback window): adopt the live response.
        crossEpochAdopt = true;
      }
    }

    if (drop !== null) {
      // entry is non-null whenever drop is set (only that branch assigns it).
      const applied = this.hasAppliedValue(key, params);
      this.emitStaleDrop(key, params, drop, body, entry!, serverEpoch, source, !applied);
      trace(`http drop key=${key} params=${paramsKey(params)} msgVersion=${body.version} haveVersion=${entry!.version} reason=${drop} source=${source}`);
      // Applied → the cache holds newer server-vouched truth; keep it. Never-
      // applied → the cache holds only the placeholder, and settling the query
      // with it (or applying the stale body) is the wedge. Throw instead: RQ
      // retry + the next invalidate frame converge the legitimate race, and a
      // persistent failure surfaces typed and visible instead of confidently
      // wrong.
      if (applied) return this.getCachedResource(key, params) as T;
      throw new ResourceStaleReadError(key, body.version, entry!.version, drop);
    }

    const parsed = schema.parse(body.value); // schema violation throws — surfaced by the caller
    // Adopt the body's commit watermark AFTER the guard (a stale-dropped response
    // never advances the causal floor) and IMMEDIATELY BEFORE the cache write it
    // describes — same load-bearing order as the WS paths.
    if (body.watermark !== undefined) noteResourceWatermark(key, params, body.watermark);
    this.queryClient.setQueryData(queryKeyFor(key, params), parsed);
    if (entry) {
      if (crossEpochAdopt) {
        // Cross-epoch adopt: the old-boot version number is meaningless, so take
        // the body's version UNCONDITIONALLY and re-stamp the entry's boot
        // identity (body.epoch is defined on every cross-epoch adopt path).
        entry.version = body.version;
        entry.epoch = body.epoch;
      } else if (body.version > entry.version) {
        // Same-epoch (or legacy) apply: advance monotonically (never lower) so a
        // later WS frame at this version is stale-dropped cheaply and a genuinely-
        // newer one still applies. Epoch is left to the WS ack path.
        entry.version = body.version;
      }
      this.markApplied(entry, key); // stamps lastAppliedAt + resets drop count + emitDebug + verbose trace
    }
    trace(`http key=${key} params=${paramsKey(params)} version=${body.version} source=${source}`);
    return parsed;
  }

  /** Bump the consecutive-drop counter for (key, params) and emit the running
   *  count to the stale-drop report sink. Called on EVERY `fetchOverHttp` drop
   *  (both same-epoch strict-`<` and cross-boot stale-epoch); the counter resets
   *  in `markApplied` on the next successful apply. */
  private emitStaleDrop(
    key: string,
    params: ResourceParams,
    reason: "stale-version" | "stale-epoch",
    body: { version: number; epoch?: string },
    entry: ActiveSub,
    serverEpoch: string | undefined,
    source: "prime" | "fallback",
    neverApplied: boolean,
  ): void {
    const id = `${key}\0${paramsKey(params)}`;
    const consecutiveDrops = (this.staleDropCounts.get(id) ?? 0) + 1;
    this.staleDropCounts.set(id, consecutiveDrops);
    httpStaleDropReportSink.emit({
      key,
      params,
      reason,
      consecutiveDrops,
      bodyVersion: body.version,
      haveVersion: entry.version,
      bodyEpoch: body.epoch ?? null,
      entryEpoch: entry.epoch ?? null,
      serverEpoch: serverEpoch ?? null,
      source,
      neverApplied,
    });
  }

  /** Cold-start accelerator: prime a resource's first value over plain HTTP when
   *  the notifications transport isn't ready yet. Delegates to the shared
   *  version-guarded `fetchOverHttp`; best-effort — the WS sub-ack remains the
   *  source of truth. A transient network / HTTP-status failure is swallowed
   *  (the WS will deliver); a schema/parse failure is a real bug surfaced loudly
   *  (mirroring the WS `onmessage` discipline). Never rejects (safe to `void`). */
  async primeFromHttp(key: string, params: ResourceParams = {}, origin?: ResourceOrigin): Promise<void> {
    const entry = this.channels[socketKindFor(origin)]?.subs.get(`${key}\0${paramsKey(params)}`);
    if (!entry) return; // observe() must have created the sub
    const schema = this.schemas.get(key);
    if (!schema) return;
    try {
      await this.fetchOverHttp(key, params, origin, schema, "prime");
    } catch (err) {
      if (
        err instanceof TypeError ||
        err instanceof ResourceHttpError ||
        err instanceof ResourceStaleReadError
      ) {
        // Transient network / HTTP-status / stale-read failure during cold boot —
        // non-fatal; prime is best-effort and the WS sub-ack remains the source of
        // truth and will deliver.
        // Each check runs on the full caught union (no cross-narrowing) so the
        // trace label is derived without a nested-instanceof narrow.
        const isNetwork = err instanceof TypeError;
        const isStaleRead = err instanceof ResourceStaleReadError;
        const reason = isNetwork ? "network" : isStaleRead ? "stale-read" : "http";
        trace(`http drop key=${key} params=${paramsKey(params)} reason=${reason} source=prime error=${String(err)}`);
        return;
      }
      // Schema violation / malformed body is a real bug — surface loudly like the
      // WS onmessage path, without rejecting this promise.
      trace(`http error key=${key} params=${paramsKey(params)} source=prime error=${String(err)}`);
      queueMicrotask(() => { throw err; });
    }
  }

  /**
   * Lazily create + open + cache the channel for `kind`, returning the cached
   * one on every subsequent call. The worktree channel is created eagerly in the
   * constructor; the central channel is created only on the first central-origin
   * `observe()` — the single deliberate creation point (every read-only accessor
   * reads `this.channels[kind]` directly and tolerates its absence). An app with
   * no central resources never opens /ws/central-notifications this way.
   */
  private channelFor(kind: SocketKind): SocketChannel {
    const existing = this.channels[kind];
    if (existing) return existing;
    const channel = this.openChannel(kind);
    this.channels[kind] = channel;
    return channel;
  }

  private openChannel(kind: SocketKind): SocketChannel {
    const channel: SocketChannel = {
      ws: this.makeSocket(WS_URLS[kind]),
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
   * Resend ALL of a channel's subs as ONE `sub-batch` frame — after a fresh
   * connection (the server has no record of our subs) and for the missed-update
   * probe's forced resync. Per sub, the local versions reset to the -1 "nothing
   * applied yet" baseline so the next ack always applies — even a
   * never-notified resource's version-0 sub-ack, and even a lower version after
   * a server restart reset its counters. The pre-reset version is echoed in the
   * batch entry (with the channel's known server epoch) so a SAME-boot server
   * answers every already-current sub from its in-memory version counter — one
   * `up-to-date-batch` frame, zero loader runs. `sub.etag` is deliberately
   * KEPT and echoed too: the cached TanStack value survives a reconnect (the
   * socket dropped, not the page), so it still describes a value we hold.
   *
   * Snapshot + build + send happen in ONE synchronous task, so an `observe()`
   * cannot interleave between the baseline reset and the send, and the probe
   * can read `lastAckVersion` after a fixed settle with no late-batch blind
   * spot. (The old per-sub stagger is gone: same-boot replays short-circuit
   * server-side for ~0, and post-restart replays are bounded by the server's
   * read-admission gate + single-flight dedup — the correct layer for herd
   * control, not client-side pacing.)
   *
   * Subs in their keep-alive window (refcount 0, still in `channel.subs`) are
   * resent here too. That's intentional and harmless: their pendingTeardown
   * timer still fires and tears them down on schedule, independent of
   * reconnect. `complete: true` makes the batch the server's whole truth for
   * THIS tab on this socket: anything the tab held server-side and did not
   * restate is released (the stale-sub reconciliation).
   */
  private replaySubs(channel: SocketChannel): void {
    const socket = channel === this.channels.central ? "central" : "worktree";
    trace(`replaySubs socket=${socket} subCount=${channel.subs.size} epoch=${channel.serverEpoch !== undefined ? 1 : 0}`);
    // Nothing to replay → nothing to send. Replays run on a FRESH socket (the
    // server holds no subs for this tab yet), so an empty `complete` batch
    // would reconcile nothing; skipping keeps the wire quiet, matching the old
    // per-sub behavior.
    if (channel.subs.size === 0) {
      this.emitDebug();
      return;
    }
    const entries: Array<{
      id: number;
      key: string;
      params: ResourceParams;
      etag?: string;
      version?: number;
    }> = [];
    for (const sub of channel.subs.values()) {
      // Capture the version BEFORE the baseline reset — it names the state the
      // cached value was produced under, which is exactly what the server's
      // short-circuit compares. The reset itself keeps the apply-lower-version
      // semantics a post-restart full sub-ack depends on (H2).
      const knownVersion = sub.version;
      sub.version = -1;
      // The next ack is the fresh baseline. Clear it so a stale pre-resync ack
      // can't be read as the resync's (liveFrameSeq is a monotonic counter and
      // is never reset).
      sub.lastAckVersion = -1;
      entries.push({
        id: this.nextMsgId++,
        key: sub.key,
        params: sub.params,
        ...(sub.etag !== undefined ? { etag: sub.etag } : {}),
        ...(knownVersion >= 0 ? { version: knownVersion } : {}),
      });
    }
    channel.ws.send(
      JSON.stringify({
        op: "sub-batch",
        tabId: this.tabId,
        ...(channel.serverEpoch !== undefined ? { epoch: channel.serverEpoch } : {}),
        complete: true,
        entries,
      }),
    );
    this.emitDebug();
  }

  private sendSub(channel: SocketChannel, key: string, params: ResourceParams): void {
    const socket = channel === this.channels.central ? "central" : "worktree";
    // Attach the sub's last-known ETag (if any) so the server can answer
    // `up-to-date` instead of re-running the loader. Read off the live sub entry
    // so every caller (fresh observe with no etag, delta-recovery resub that
    // cleared it) sends the right thing. Single subs never echo a version —
    // a fresh observe has no baseline and a recovery resub must NOT have one
    // (see forceFullResub); the version echo lives in the replay batch.
    const etag = channel.subs.get(`${key}\0${paramsKey(params)}`)?.etag;
    trace(`sendSub key=${key} params=${paramsKey(params)} socket=${socket}${etag !== undefined ? " etag=1" : ""}`);
    channel.ws.send(
      JSON.stringify({
        op: "sub",
        id: this.nextMsgId++,
        key,
        params,
        ...(etag !== undefined ? { etag } : {}),
        tabId: this.tabId,
      }),
    );
  }

  /**
   * Force a FULL resubscribe for a sub whose cached base is unusable (a delta
   * with no base, or drift — `order` named ids we cannot resolve). Clears the
   * stored etag AND resets the version baselines BEFORE sending a version-less,
   * etag-less sub, so the recovery answer is always a full sub-ack and it
   * always APPLIES. The baseline reset is load-bearing: `handleServerMessage`
   * adopts a frame's version before dispatching, so the broken delta already
   * advanced `entry.version` to the server's current version — without the
   * reset, the recovery sub-ack (same version) would be dropped by the `<=`
   * guard and the cache would never heal until an unrelated bump.
   */
  private forceFullResub(
    channel: SocketChannel,
    entry: ActiveSub,
    key: string,
    params: ResourceParams,
  ): void {
    entry.etag = undefined;
    entry.version = -1;
    entry.lastAckVersion = -1;
    this.sendSub(channel, key, params);
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
      const pk = paramsKey(msg.params);
      trace(`sub-error key=${msg.key} params=${pk} reason=${msg.reason}`);
      // Gate on the local sub entry exactly like every other frame: the shared
      // socket broadcasts to every tab, and a pre-upgrade server's params-less
      // frame (`msg.params` undefined) won't match a live sub → safe drop. When
      // this tab DOES hold the sub, drive the HTTP-fallback refetch via
      // applyInvalidate — its own outcome sets q.error naturally (500
      // loader-failed / 404 → ResourceHttpError) or heals if transient — instead
      // of leaving the resource wedged `pending` forever with `error: null`.
      // NOTE: handleResourceHttp runs no `authorize` check today; moot with zero
      // authorize resources, a follow-up composes with this invalidate flow when
      // the authorize seam ships.
      const entry = channel.subs.get(`${msg.key}\0${pk}`);
      if (!entry) {
        trace(`drop key=${msg.key} params=${pk} reason=no-sub source=sub-error`);
        return;
      }
      this.applyInvalidate(msg.key, msg.params);
      return;
    }
    if (msg.kind === "ack") {
      // Standalone mutation-ack frame: version-less and cache-less, so it must
      // be handled BEFORE the version-guard block below (it carries no version
      // to compare). Gated on the local sub entry exactly like `sub-error`
      // (the shared socket broadcasts every frame to every tab). Notes the acks
      // into the module registry — which fires the registry's subscribers after
      // noting — and does NOTHING else: no cache write, no markApplied, no
      // version/epoch adoption.
      const pk = paramsKey(msg.params);
      const entry = channel.subs.get(`${msg.key}\0${pk}`);
      if (!entry) {
        trace(`drop key=${msg.key} params=${pk} reason=no-sub source=ack`);
        return;
      }
      noteResourceTxAcks(msg.key, msg.params, msg.ackTx);
      return;
    }
    // Learn the server's boot epoch from any ack frame carrying one — BEFORE the
    // per-sub gates below, since the epoch is channel-level server identity (an
    // ack for another tab's sub teaches it just as well). The next replay echoes
    // it alongside each sub's version so a same-boot server can short-circuit.
    if (
      (msg.kind === "sub-ack" || msg.kind === "up-to-date" || msg.kind === "up-to-date-batch") &&
      msg.epoch !== undefined
    ) {
      channel.serverEpoch = msg.epoch;
    }
    if (msg.kind === "up-to-date-batch") {
      // The batched replay answer: run each entry through the exact per-entry
      // `up-to-date` logic (no-sub gate, version guard, adoption, lastAckVersion).
      for (const e of msg.entries) {
        this.handleServerMessage(channel, {
          kind: "up-to-date",
          id: e.id,
          key: e.key,
          params: e.params,
          version: e.version,
          epoch: msg.epoch,
        });
      }
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
      // Stamp which server boot `entry.version` now belongs to. Only ack frames
      // carry `epoch` (sub-ack, and up-to-date — incl. the up-to-date-batch that
      // recurses through it with the batch epoch attached); update/delta/
      // invalidate ride the same boot's stream and leave `entry.epoch` unchanged.
      // This is what lets `fetchOverHttp`'s guard compare an HTTP body cross-boot.
      if (msg.epoch !== undefined) entry.epoch = msg.epoch;
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
      this.applyUpdate(
        entry,
        msg.key,
        msg.params,
        msg.value,
        msg.watermark,
        msg.kind === "update" ? msg.ackTx : undefined,
      );
      return;
    }
    if (msg.kind === "delta") {
      this.applyDelta(channel, entry, msg.key, msg.params, msg.upserts, msg.order, msg.watermark, msg.ackTx);
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
    watermark?: string,
    ackTx?: string[],
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
    const parsed = schema.parse(value);
    // Adopt the frame's commit watermark — and note its mutation acks —
    // IMMEDIATELY BEFORE the cache write they describe (load-bearing order:
    // QueryCache listeners — the optimistic hook's confirm pass — read the
    // registries synchronously inside setQueryData dispatch). After the parse,
    // so a frame that never lands (schema throw) never advances the causal
    // floor / acks past the cache content.
    if (watermark !== undefined) noteResourceWatermark(key, params, watermark);
    if (ackTx !== undefined && ackTx.length > 0) noteResourceTxAcks(key, params, ackTx);
    this.queryClient.setQueryData(queryKeyFor(key, params), parsed);
    this.markApplied(entry, key);
  }

  /** Stamp the apply time, fire debug listeners, and emit the verbose-gated apply
   *  trace. Covers WS applies (applyUpdate/applyDelta) and the HTTP apply
   *  (fetchOverHttp), so it is the single place the consecutive stale-drop counter
   *  is reset on a successful apply. */
  private markApplied(entry: ActiveSub, key: string): void {
    entry.lastAppliedAt = Date.now();
    this.staleDropCounts.delete(`${key}\0${paramsKey(entry.params)}`);
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
    watermark?: string,
    ackTx?: string[],
  ): void {
    const queryKey = queryKeyFor(key, params);
    // Base-presence guard (load-bearing): never apply a delta onto a missing
    // base. If the cache has no value yet, force a fresh full snapshot.
    if (this.queryClient.getQueryData(queryKey) === undefined) {
      trace(`applyDelta key=${key} params=${paramsKey(params)} reason=delta-no-base-resub`);
      // The cached base is gone — recovery must reload a full base, and its
      // sub-ack must APPLY even at the version this very delta already advanced
      // us to (see forceFullResub: etag cleared + baselines reset).
      this.forceFullResub(channel, entry, key, params);
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
      // Base drifted behind server truth — recovery reloads a full base (etag
      // cleared so it's never told `up-to-date`) and its sub-ack applies even
      // at this delta's own version (baselines reset — see forceFullResub).
      this.forceFullResub(channel, entry, key, params);
      return;
    }
    // Adopt the FULL delta's commit watermark — and note the delta's mutation
    // acks — IMMEDIATELY BEFORE the cache write they describe (same load-bearing
    // order as applyUpdate). After the merge succeeded, so a delta that
    // dead-ends in a forced resub (no-base / drift above) never advances the
    // causal floor OR the acks past the cache content — the recovery sub-ack
    // brings its own watermark with its own full value. Scoped deltas arrive
    // watermark-less by construction (Rule B′) but DO carry ackTx: the ack
    // claims only "these transactions' rows were re-read", never snapshot
    // completeness, so it composes with a partial re-read.
    if (watermark !== undefined) noteResourceWatermark(key, params, watermark);
    if (ackTx !== undefined && ackTx.length > 0) noteResourceTxAcks(key, params, ackTx);
    this.queryClient.setQueryData(queryKey, result.rows);
    this.markApplied(entry, key);
  }

  private applyInvalidate(key: string, params: ResourceParams): void {
    void this.queryClient.invalidateQueries({ queryKey: queryKeyFor(key, params) });
  }
}
