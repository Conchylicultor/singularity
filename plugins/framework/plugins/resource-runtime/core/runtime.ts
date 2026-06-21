import type { ServerWebSocket } from "bun";
import type { ZodType } from "zod";
import { createInflight } from "@plugins/packages/plugins/inflight/core";
import {
  buildSnapshot,
  diffKeyedFull,
  diffKeyedScoped as diffKeyedScopedPure,
  type KeyedDiff,
} from "./keyed-diff";

// Shared live-state resource runtime. See
// research/2026-04-15-global-sse-lifecycle-mental-model-v3.md and
// research/2026-06-08-global-unify-live-state-resource-runtime.md.
//
// This is the single, parameterized implementation behind both the per-worktree
// server runtime (@plugins/framework/plugins/server-core/core) and the central
// runtime (@plugins/framework/plugins/central-core/core). Each facade calls
// `createResourceRuntime(opts)` with its runtime-specific hooks; the ~42
// `defineResource` call sites and ~37 `Resource.Declare` contributors are
// unaffected because the facades re-present this runtime's types and bind its
// returned values.
//
// A plugin calls defineResource({key, loader, schema, mode?}). The host exposes:
//   GET /api/resources/:key (or /api/central-resources/:key) — HTTP fallback
//   WS  /ws/notifications  (or /ws/central-notifications)     — single push channel
// and broadcasts updates when the plugin calls resource.notify().
//
// The runtime is acyclic: besides `zod` (ZodType) and `bun` (ServerWebSocket
// type) it imports only `@plugins/packages/plugins/inflight/core` (itself a leaf,
// so no cycle). It declares its own local WsData/WsHandler interfaces
// (byte-identical to server-core/central-core's types.ts) rather than importing
// them — importing from either facade would create a cycle. The returned
// `notificationsWsHandler` is structurally assignable to each facade's WsHandler.

// Local, cycle-free copy of the WS types (see server-core/central-core types.ts).
interface WsData {
  path: string;
}

interface WsHandler {
  open(ws: ServerWebSocket<WsData>): void;
  message(ws: ServerWebSocket<WsData>, msg: string | Buffer): void;
  close(ws: ServerWebSocket<WsData>, code: number, reason: string): void;
}

export type ResourceMode = "push" | "invalidate" | "keyed";
export type ResourceParams = Record<string, string>;

/**
 * The shared L4 contract: one resolved unit of "this resource (at these params)
 * must recompute because of this DB change". Produced by `applyDbChange` (the DB
 * change-feed router) and today routed straight through `scheduleNotify`. When the
 * work-admission scheduler lands (separate worktree) it consumes this type on the
 * *admit* side; the producer (`applyDbChange`) is unchanged. `delta` is either a
 * scoped row change (op + the changed PK ids) or `"FULL"` (membership/order
 * change, a vanished row, or an over-cap / pk-less write). See
 * research/2026-06-19-global-live-state-l4-db-change-feed.md §2.
 */
export type RecomputeIntent = {
  resource: string;
  key: ResourceParams;
  delta: { table: string; ids: string[]; op: "I" | "U" | "D" } | "FULL";
};

// Upstream edge: when `resource` notifies, this resource is cascaded.
// `map` translates upstream params (and optionally value) into the list of
// downstream params tuples to schedule. Default: identity (`[upstreamParams]`).
// See `research/2026-04-16-global-derived-state-primitive-v2.md`.
export interface DependsOnEntry<P extends ResourceParams = ResourceParams> {
  // biome-ignore lint/suspicious/noExplicitAny: upstream type is erased — the map callback owns the shape.
  resource: Resource<any, any>;
  map?: (
    // biome-ignore lint/suspicious/noExplicitAny: see above.
    upstreamParams: any,
    upstreamValue: unknown,
  ) => P[];
  /**
   * Scoped-recompute (Layer 2): translate the set of changed upstream row ids
   * into the set of changed downstream row ids, so the downstream loader can
   * recompute only the affected rows (`WHERE id IN (…)`) instead of the whole
   * view. Only consulted when the upstream notify carried `affectedIds`. If
   * absent (or it throws), the cascade degrades the downstream to a FULL
   * recompute — never silently drops a change. Must self-query the DB rather
   * than read the upstream value, so it does NOT force the upstream loader to
   * run. See research/2026-06-06-global-live-state-layer2-scoped-recompute-impl.md.
   */
  affectedMap?: (
    upstreamAffected: ReadonlySet<string>,
    // biome-ignore lint/suspicious/noExplicitAny: upstream params type is erased — see above.
    upstreamParams: any,
  ) => Promise<string[]> | string[];
}

export interface ResourceDefinition<T, P extends ResourceParams = ResourceParams> {
  key: string;
  mode?: ResourceMode;
  /**
   * Compute the resource value for `params`. When the notify that triggered
   * this load carried scoped `affectedIds` (Layer 2), `ctx.affectedIds` lists
   * the changed row ids and the loader MAY recompute only those rows (returning
   * a partial array for `keyed` mode — the diff merges it into the snapshot).
   * Full loads (sub-ack, HTTP fallback, plain `notify()`) pass `ctx === undefined`.
   */
  loader: (params: P, ctx?: { affectedIds: readonly string[] }) => Promise<T> | T;
  /**
   * Zod schema for the payload. Required. The server parses every loader output
   * against it at load time (single chokepoint in `timedLoad`) before any
   * broadcast — a payload that violates its schema fails loudly instead of
   * shipping. The descriptor exposed to clients carries the same schema so the
   * browser re-parses before the value lands in the TanStack cache. See
   * research/2026-06-08-global-mandatory-resource-schema-server-validation.md.
   */
  schema: ZodType<T>;
  /**
   * Row identity for `mode: "keyed"` resources. Required (and only meaningful)
   * when `mode === "keyed"`: the loader's `T` must be an array, and `keyOf`
   * extracts a stable id from each row. The server keeps a per-(key,params)
   * snapshot of id→hash and broadcasts only changed rows + the id order, so a
   * single-row change ships one row instead of the whole array. See
   * research/2026-06-05-global-live-state-delta-sync.md.
   */
  // biome-ignore lint/suspicious/noExplicitAny: row type is the element of the array payload — erased here.
  keyOf?: (row: any) => string;
  /**
   * Upstream resources. When any listed resource notifies, this resource is
   * scheduled to notify within the same microtask flush, with per-key /
   * per-params coalescing. Cycles are detected at boot (warn-only in phase 1).
   */
  dependsOn?: ReadonlyArray<DependsOnEntry<P>>;
  /**
   * The base table whose primary key equals this resource's `keyOf` id (i.e. the
   * loader reads its own identity view / table). Declaring it lets the L4
   * change-feed deliver a scoped row change to this resource in its OWN key space
   * (`ctx.affectedIds` are this resource's keys → `WHERE id IN (…)`), rather than
   * degrading to a FULL recompute. It is also the unit of cross-resource
   * coverage: a downstream `affectedMap` edge translates THIS table's changed ids
   * into the downstream's keys, so the runtime routes a covered change through the
   * single authoritative path (this identity view OR an edge) and never lets a
   * secondary view-fanout FULL absorb the scoped delivery. Omit it to keep the
   * resource on FULL-recompute (the safe default). See
   * research/2026-06-20-global-scoped-recompute-default.md.
   *
   * MUST be a BASE TABLE name, never a view name — `applyDbChange`'s `origin` is
   * always the base table that changed, so a view name here silently never matches
   * and the resource quietly stays on FULL recompute.
   */
  identityTable?: string;
  /**
   * Explicit opt-out: this keyed resource intentionally FULL-recomputes (its key
   * is not a single base-table PK, or its read is irreducibly whole-set). Required
   * ON A KEYED RESOURCE when `identityTable` is omitted, so a FULL fallback is
   * always a declared, documented choice — never a silent default. `reason` is
   * surfaced in the read-set debug pane and read by the future work-admission
   * scheduler when it decides whether to admit a FULL recompute intent.
   */
  recompute?: { kind: "full"; reason: string };
  /**
   * Fixed-window trailing debounce (ms) for this resource's flushes. When set
   * (and > 0), a `notify()` (or cascaded `mergePending`) into this entry does
   * NOT ride the immediate microtask flush; instead it arms a per-entry timer
   * that triggers a flush after the window. The timer is NOT re-armed on
   * subsequent notifies within the window (fixed window, starvation-free), so a
   * continuously-ticking source still flushes at least every `debounceMs`. The
   * merge into `pendingNotifies` is unchanged, so all coalescing keeps working —
   * the debounce only delays *when* the accumulated pending map drains.
   * Piggyback: if any other (non-debounced) resource triggers a flush during the
   * window, that flush drains this entry's pending too and cancels the timer, so
   * debounced data never adds latency beyond an already-happening flush.
   * Do NOT use on keyed resources driving optimistic-mutation delta-sync —
   * debounce the *source* instead. See
   * research/2026-06-15-global-live-state-cascade-contention.md.
   */
  debounceMs?: number;
  /**
   * Sub-lifecycle hooks. Fire on the 0→1 and N→0 global refcount transitions
   * for a given params tuple (counted across every open socket; a socket
   * closing releases the refs it held).
   */
  onFirstSubscribe?: (params: P) => void | Promise<void>;
  onLastUnsubscribe?: (params: P) => void;
}

/**
 * A keyed resource's scope policy: it MUST either declare `identityTable` (its
 * change scopes to its own keys) or `recompute: { kind: "full", reason }` (an
 * explicit, documented FULL opt-out) — never both, never neither. This is the
 * mandatory-by-construction half of scoped-recompute coverage (the build-gating
 * check is the backstop). See
 * research/2026-06-20-global-enforce-keyed-resource-scope-coverage.md.
 */
export type ScopePolicy =
  | { identityTable: string; recompute?: never }
  | { recompute: { kind: "full"; reason: string }; identityTable?: never };

/**
 * The strict public input to `defineResource` (the runtime keeps the loose
 * `ResourceDefinition` internally). `mode: "keyed"` requires `keyOf` AND a
 * `ScopePolicy`; `push`/`invalidate` resources may still optionally set
 * `identityTable` (e.g. a push aggregate that propagates scoped ids downstream).
 * `defineExternalResource` is deliberately NOT constrained — keyed external
 * resources have no DB feed to scope against.
 */
export type DefineResourceInput<T, P extends ResourceParams = ResourceParams> =
  | (Omit<ResourceDefinition<T, P>, "mode" | "keyOf" | "identityTable" | "recompute"> & {
      mode?: "push" | "invalidate";
      identityTable?: string;
    })
  | (Omit<ResourceDefinition<T, P>, "mode" | "keyOf" | "identityTable" | "recompute"> & {
      mode: "keyed";
      // biome-ignore lint/suspicious/noExplicitAny: row type is the element of the array payload — erased here (mirrors ResourceDefinition.keyOf).
      keyOf: (row: any) => string;
    } & ScopePolicy);

/**
 * The browser-safe half of a resource declaration: exactly the fields a client
 * `ResourceDescriptor` already carries that the server *also* needs — the `key`,
 * the `schema`, and (for delta-sync) the keyed row identity. `defineResource`'s
 * two-arg form takes one of these and the server supplies only the DB-bound half
 * (`ServerResourceOptions`), so `key` / `schema` / keyed-ness are declared in
 * exactly ONE place — the shared descriptor — instead of being restated on both
 * sides and silently drifting (the "server says keyed, client forgot its keyOf"
 * crash this collapses out of existence).
 *
 * Matched **structurally**: the live-state `ResourceDescriptor` satisfies this
 * shape without the runtime importing the live-state primitive, so this module
 * stays acyclic. `P` is threaded through the same phantom `__params` the
 * descriptor uses, so the server resource inherits the descriptor's param typing.
 */
export interface ResourceContract<T, P extends ResourceParams = ResourceParams> {
  key: string;
  schema: ZodType<T>;
  keyed?: { keyOf: (row: unknown) => string };
  /** Phantom — carries `P` for inference, mirroring the client descriptor. */
  readonly __params?: P;
}

/**
 * A keyed contract — the client descriptor carries a `keyOf` (produced by
 * `keyedResourceDescriptor`, whose return type makes `keyed` REQUIRED). The
 * server's two-arg `defineResource` matches this overload and pairs it with a
 * mandatory `ScopePolicy`, so a keyed resource declared via the descriptor form
 * is held to the SAME scope-coverage invariant as the flat `DefineResourceInput`
 * form — the descriptor path is not an escape hatch.
 */
export type KeyedResourceContract<T, P extends ResourceParams = ResourceParams> =
  ResourceContract<T, P> & { keyed: { keyOf: (row: unknown) => string } };

/**
 * Server-only half of a resource declaration, paired with a `ResourceContract`
 * in `defineResource`'s two-arg form. Everything here pulls loader/DB code that
 * must never enter the browser bundle; the browser-safe `key`/`schema`/keyed
 * fields come from the contract. `mode` picks push vs invalidate for a non-keyed
 * contract (a keyed contract forces `"keyed"` from its own `keyOf`, so `mode`
 * excludes it). The keyed overload additionally intersects `ScopePolicy`, which
 * makes `identityTable` (or the explicit `recompute:` FULL opt-out) mandatory.
 */
export interface ServerResourceOptions<T, P extends ResourceParams = ResourceParams> {
  loader: ResourceDefinition<T, P>["loader"];
  mode?: Exclude<ResourceMode, "keyed">;
  dependsOn?: ResourceDefinition<T, P>["dependsOn"];
  identityTable?: string;
  debounceMs?: number;
  onFirstSubscribe?: ResourceDefinition<T, P>["onFirstSubscribe"];
  onLastUnsubscribe?: ResourceDefinition<T, P>["onLastUnsubscribe"];
}

// Fold a (contract, server-opts) pair into the flat `ResourceDefinition` the
// runtime registers. Pure — keyed-ness comes solely from the contract, so the
// server cannot disagree with the client about it. `recompute` (the keyed FULL
// opt-out, supplied via the keyed overload's `ScopePolicy`) is threaded through.
function contractToDefinition<T, P extends ResourceParams>(
  contract: ResourceContract<T, P>,
  opts: ServerResourceOptions<T, P> & {
    identityTable?: string;
    recompute?: { kind: "full"; reason: string };
  },
): ResourceDefinition<T, P> {
  return {
    key: contract.key,
    schema: contract.schema,
    mode: contract.keyed ? "keyed" : (opts.mode ?? "invalidate"),
    keyOf: contract.keyed?.keyOf,
    loader: opts.loader,
    dependsOn: opts.dependsOn,
    identityTable: opts.identityTable,
    recompute: opts.recompute,
    debounceMs: opts.debounceMs,
    onFirstSubscribe: opts.onFirstSubscribe,
    onLastUnsubscribe: opts.onLastUnsubscribe,
  };
}

export interface Resource<T, P extends ResourceParams = ResourceParams> {
  key: string;
  mode: ResourceMode;
  schema: ZodType<T>;
  load(params: P): Promise<T>;
}

/**
 * A resource whose truth lives OUTSIDE Postgres (git refs, file watchers,
 * transcript reads, in-memory registries, the secrets API). The DB change-feed
 * can never observe these, so they keep an explicit hand-`notify()` — declared
 * via `defineExternalResource`, which is the only way to get a callable `notify`.
 * A DB-backed resource (declared with plain `defineResource`) has no `notify`
 * method at all, so hand-notifying it is a compile error. See
 * research/2026-06-20-global-remove-hand-notify-dependson.md §2.
 */
export interface ExternalResource<T, P extends ResourceParams = ResourceParams>
  extends Resource<T, P> {
  /**
   * Signal that state has changed. No-arg = parameterless resource.
   * `opts.affectedIds` (Layer 2) scopes the recompute to those row ids — the
   * loader receives them via `ctx.affectedIds` and may return only the changed
   * rows. Omit it for full-recompute semantics (the correct default for any
   * membership change: create/delete/reorder). Sticky FULL: any id-less
   * contributor to the same flush degrades the whole pk back to FULL.
   */
  notify(params?: P, opts?: { affectedIds?: string[] }): void;
}

interface DownstreamEdge {
  downstreamKey: string;
  map?: (upstreamParams: ResourceParams, upstreamValue: unknown) => ResourceParams[];
  affectedMap?: (
    upstreamAffected: ReadonlySet<string>,
    upstreamParams: ResourceParams,
  ) => Promise<string[]> | string[];
}

// A coalesced pending notify for one params-tuple. `affected === null` means
// FULL recompute (sticky/absorbing): once a flush has any id-less contributor
// the pk stays FULL. A non-null Set scopes the recompute to those row ids.
interface PendingNotify {
  params: ResourceParams;
  affected: Set<string> | null;
  /**
   * `performance.now()` of the FIRST notify that opened this pending entry — the
   * moment the resource became stale. Set only in the `!existing` branch of
   * `mergePending` and NEVER overwritten on re-merge (coalesce / debounce re-arm
   * / cascade re-merge all route through `mergePending`), so the delivery-latency
   * window measures real staleness from first notify to send, not ~0. Read once
   * in `flushNotifies` to compute `onDelivered` latency.
   */
  enqueuedAt: number;
}

interface RegistryEntry {
  key: string;
  mode: ResourceMode;
  /**
   * True when declared via `defineExternalResource` — the resource's truth lives
   * outside Postgres, so a hand-`notify()` is legitimate. The backstop check
   * (`no-db-backed-notify`) fails if such a resource's loader reads the DB.
   * Surfaced in the `_debug` payload.
   */
  externalSource?: boolean;
  /** Payload schema. The loader output is parsed against it in `timedLoad`. */
  schema: ZodType<unknown>;
  loader: (
    params: ResourceParams,
    ctx?: { affectedIds: readonly string[] },
  ) => Promise<unknown> | unknown;
  /** Row identity for keyed mode. Undefined for push/invalidate entries. */
  keyOf?: (row: unknown) => string;
  /**
   * The base table whose PK == this resource's keyOf id (declared via
   * `identityTable`). Drives scoped-vs-FULL routing in `applyDbChange`: a change
   * whose `origin` equals this is delivered scoped via the identity view; covered
   * origins from `affectedMap` edges are routed through those edges instead.
   * Undefined → the resource stays on FULL recompute (safe default).
   */
  identityTable?: string;
  /**
   * Explicit FULL opt-out (declared via `recompute`). Declaration-only today —
   * the runtime still treats "no `identityTable`" as FULL behaviourally — but
   * surfaced here so the read-set debug pane and the future work-admission
   * scheduler can read whether a keyed resource's FULL recompute is a deliberate,
   * documented choice rather than a silent default.
   */
  recompute?: { kind: "full"; reason: string };
  /**
   * Per-pk snapshot of id→hash for keyed entries. Allocated lazily only when
   * `mode === "keyed"`. Lets the diff ship only changed rows. Evicted per-pk on
   * the N→0 sub transition so memory is bounded to actively-observed pks.
   */
  snapshots?: Map<string, Map<string, string>>;
  /**
   * Monotonic count of state changes (notifies) per params-tuple. Bumped ONLY
   * in flushNotifies — a real state change. sub-acks and the HTTP fallback
   * REPORT this value without bumping (a read is not a change), so a forced
   * resync (which re-subscribes every sub) does not make the version appear to
   * advance. The client's probeMissedUpdates compares it across a hidden→visible
   * resync to detect frames it missed while hidden — that only works if
   * subscribing is inert.
   */
  versions: Map<string, number>;
  /** Coalesced pending notifies per params-tuple. */
  pendingNotifies: Map<string, PendingNotify>;
  /** Fixed-window trailing debounce (ms) for this entry's flushes. 0/undefined = immediate. */
  debounceMs?: number;
  /**
   * Armed debounce timer handle, or undefined when not armed. Set when the first
   * notify in a window arrives; cleared on fire (which schedules a flush) or when
   * `flushNotifies` drains this entry's pending out from under it (piggyback).
   */
  debounceTimer?: ReturnType<typeof setTimeout>;
  /** Global subscriber refcount per params-tuple (across all sockets). */
  subCounts: Map<string, number>;
  /** Upstream keys this entry listens to (for cycle detection). */
  upstreamKeys: string[];
  /**
   * Longest-path depth from a root (no-upstream entry = 0). Computed in
   * `rebuildDag`; every `dependsOn` edge strictly increases depth, so entries
   * sharing a depth are mutually independent and flush concurrently.
   */
  depth?: number;
  /** Downstream entries to cascade to when this entry notifies. */
  downstream: DownstreamEdge[];
  onFirstSubscribe?: (params: ResourceParams) => void | Promise<void>;
  onLastUnsubscribe?: (params: ResourceParams) => void;
}

interface SocketState {
  ws: ServerWebSocket<WsData>;
  /** key -> paramsKey -> params object (subscriptions this socket holds). */
  subs: Map<string, Map<string, ResourceParams>>;
}

export interface ResourceRuntimeOptions {
  /** Wrap each loader call. server: recordEntrySpan("loader", key, fn); central: omit (identity). */
  wrapLoad?: (key: string, fn: () => Promise<unknown>) => Promise<unknown>;
  /**
   * Wrap an origin-triggered load so child loader spans (and the gate waits they
   * charge) attribute to the originating request class — `sub` (a tab subscribed)
   * or `push` (a notify cascade). Without it the loader runs with no entry
   * context and gets `parent: null`. server: recordEntrySpan(kind, key, fn);
   * central: omit (identity). See
   * research/2026-06-19-global-wait-attribution-instrumentation.md.
   */
  wrapOrigin?: (
    kind: "sub" | "push",
    key: string,
    fn: () => Promise<unknown>,
  ) => Promise<unknown>;
  /**
   * Wrap the entire `flushNotifies` drain so the notify-flush cycle is measured
   * as one `flush` entry and the per-resource `push` loads it triggers nest under
   * it (`byParent` = which resource dominated the cycle → head-of-line). server:
   * recordEntrySpan("flush", "flushNotifies", fn); central: omit (identity). See
   * research/2026-06-19-global-observability-frequency-delivery-and-dead-job-gc.md.
   */
  wrapFlush?: (fn: () => Promise<void>) => Promise<void>;
  /**
   * Report a delivered notify: `latencyMs` = first-notify → send (the
   * "UI is stale" window), `subscribers` = how many sockets received it. server:
   * recordSpan("push", `deliver:${key}`, latencyMs); central: omit (no-op). The
   * leaf `deliver:<key>` span nests under the `flush` entry so latency attributes
   * to the resource. See the doc above.
   */
  onDelivered?: (key: string, latencyMs: number, subscribers: number) => void;
  /**
   * Per-key loader stats for the `_debug` endpoint: call count, calls-per-minute,
   * and slowest single call over the current profiling window. server: derived
   * from getRuntimeProfile().aggregates.loader (match label === key); central:
   * omit (field absent). Surfaces loader *frequency* — a cheap loader called
   * thousands of times a minute — which the slow-single-call surfaces miss.
   */
  loaderStats?: (
    key: string,
  ) => { count: number; ratePerMin: number; maxMs: number } | undefined;
  /** Report a loader/map/lifecycle failure. console.error ALWAYS fires inside the runtime;
   *  this is the extra hook. server: reportServerError(errorReport(ctx, err)); central: omit. */
  reportError?: (context: string, err: unknown) => void;
  /** Per-key owner metadata for the _debug endpoint. server: from Resource.Declare; central: omit. */
  debugOwners?: () => Array<{ key: string; pluginId?: string }>;
  /** Fired once per push to >=1 subscriber, with whether the push carried a content change.
   *  A `changed: false` push is a wasted no-op (empty keyed diff). */
  onPush?(key: string, info: { subscribers: number; changed: boolean }): void;
  /**
   * Per-key automatic table read-set for the `_debug` endpoint: the tables this
   * resource's loader actually read (captured at the DB pool chokepoint), so the
   * gaps and over-broad edges versus the hand-drawn `dependsOn` graph become
   * visible. server: from getReadSetIndex(); central: omit (field absent).
   */
  readSet?: (key: string) => string[];
  /**
   * Map a captured read-set relation to its identity base table, so the debug
   * ceiling compares like-for-like with `coveredOrigins` (stated in base-table
   * space): a view-backed loader records the VIEW (`conversations_v`), but
   * coveredOrigins names the base (`conversations`). server: relationIdentityBase
   * (resolves declared identity views, else identity); central: omitted (identity).
   */
  resolveRelation?: (relation: string) => string;
}

export interface ResourceRuntime {
  /**
   * Declare a DB-backed resource. Two shapes:
   *
   * - Flat `(def)` — the strict `DefineResourceInput`, so a `mode: "keyed"`
   *   resource that declares neither `identityTable` nor an explicit
   *   `recompute: { kind: "full", reason }` opt-out is a `tsc` error.
   * - Two-arg `(contract, serverOpts)` — derives `key`/`schema`/keyed-ness from
   *   the shared client descriptor so server and client can't drift. A KEYED
   *   contract requires a `ScopePolicy` in `serverOpts` (same scope-coverage
   *   invariant as the flat form — the descriptor path is not an escape hatch);
   *   a non-keyed contract takes plain `ServerResourceOptions`.
   *
   * Prefer the two-arg form whenever a client descriptor exists for the resource.
   */
  defineResource: {
    <T, P extends ResourceParams = ResourceParams>(def: DefineResourceInput<T, P>): Resource<T, P>;
    <T, P extends ResourceParams = ResourceParams>(
      contract: KeyedResourceContract<T, P>,
      opts: ServerResourceOptions<T, P> & ScopePolicy,
    ): Resource<T, P>;
    <T, P extends ResourceParams = ResourceParams>(
      contract: ResourceContract<T, P>,
      opts: ServerResourceOptions<T, P>,
    ): Resource<T, P>;
  };
  /**
   * Like `defineResource`, but the returned handle exposes a callable `notify()`.
   * For escape-hatch resources whose truth lives outside Postgres (the DB
   * change-feed can never reach them). Sets `entry.externalSource = true` for the
   * backstop check + `_debug` payload. See
   * research/2026-06-20-global-remove-hand-notify-dependson.md §2.
   */
  defineExternalResource: <T, P extends ResourceParams = ResourceParams>(
    def: ResourceDefinition<T, P>,
  ) => ExternalResource<T, P>;
  notificationsWsHandler: WsHandler;
  handleResourceHttp: (
    req: Request,
    params: Record<string, string>,
  ) => Promise<Response>;
  withNotifyBatch: <T>(fn: () => Promise<T>) => Promise<T>;
  /**
   * Load any registered resource by key, routing through the same `timedLoad`
   * path `handleSub` uses (schema parse + profiler span). Throws if the key is
   * not registered. The single right home for "load any registered resource"
   * — used by the boot-snapshot warm-up and snapshot handler so they hit the
   * identical loader the boot burst hits. See
   * research/2026-06-14-global-cold-load-instant-boot.md.
   */
  loadResourceByKey: (key: string, params?: ResourceParams) => Promise<unknown>;
  /**
   * Route one DB change (from the L4 change-feed) into the recompute cascade.
   * Inverts the L3 read-set (`table → resourceKey[]`), decides each resource's
   * scope from `origin` (the base table that changed) and `identityBase` (the
   * identity of the matched relation) against the resource's `identityTable` +
   * `affectedMap` coverage, fans out to every currently-subscribed params tuple
   * (param-less → `{}`), and routes through `scheduleNotify` tagged
   * `source: "feed"`. DB-agnostic and defensive: an unknown table is a no-op, and
   * it never throws. See
   * research/2026-06-19-global-live-state-l4-db-change-feed.md §6 and
   * research/2026-06-20-global-scoped-recompute-default.md.
   */
  applyDbChange: (change: {
    table: string;
    op: "I" | "U" | "D";
    ids: string[] | null;
    origin: string;
    identityBase: string;
  }) => void;
  /**
   * Self-verification counters for the `_debug` endpoint: how many notifies for
   * this resource key came from hand-`notify()` (`hand`) vs the DB change-feed
   * (`feed`). Used by the read-set debug pane to surface read-set-gap candidates.
   */
  notifyStatsFor: (key: string) => { hand: number; feed: number };
}

const HEARTBEAT_MS = 20_000;

export function createResourceRuntime(opts: ResourceRuntimeOptions = {}): ResourceRuntime {
  const registry = new Map<string, RegistryEntry>();
  const inflight = createInflight();
  let dagDirty = true;
  let topoOrder: RegistryEntry[] = [];
  // `topoOrder` grouped by longest-path depth. Each level's entries are mutually
  // independent (no intra-level edges), so a flush runs a level concurrently and
  // barriers between levels to preserve cascade-into-downstream ordering.
  let topoLevels: RegistryEntry[][] = [];
  const sockets = new Map<ServerWebSocket<WsData>, SocketState>();
  let flushScheduled = false;
  // Single-active-flush mutex. `flushRunning` ⇒ a flush is mid-await; a new
  // flush sets `flushAgain` instead of overlapping, and the live flush re-drains.
  let flushRunning = false;
  let flushAgain = false;
  let batchDepth = 0;
  const heartbeats = new Map<ServerWebSocket<WsData>, ReturnType<typeof setInterval>>();

  // --- L4 self-verification (parallel-run instrumentation) ---
  // Per-resource-key notify counters, split by source (hand-`notify()` vs the DB
  // change-feed). The feed and hand-notify run together during the migration; a
  // hand-notify with no matching recent feed intent points at a table the L3
  // read-set capture missed (a read-set-gap candidate). Cleared never — these are
  // monotonic, surfaced in the `_debug` payload.
  interface NotifyStats {
    hand: number;
    feed: number;
    lastHandAt: number;
    lastFeedAt: number;
  }
  const notifyStats = new Map<string, NotifyStats>();
  function statsFor(key: string): NotifyStats {
    let s = notifyStats.get(key);
    if (!s) {
      s = { hand: 0, feed: 0, lastHandAt: 0, lastFeedAt: 0 };
      notifyStats.set(key, s);
    }
    return s;
  }
  // Ring buffer of recent feed intents `(resourceKey, pk, t)`. A hand-notify
  // checks this window to decide whether the feed already covered the same change.
  const FEED_RING_CAP = 256;
  const FEED_MATCH_WINDOW_MS = 2000;
  const feedRing: Array<{ key: string; pk: string; t: number }> = [];
  let feedRingHead = 0;
  function recordFeedIntent(key: string, pk: string, t: number): void {
    if (feedRing.length < FEED_RING_CAP) {
      feedRing.push({ key, pk, t });
    } else {
      feedRing[feedRingHead] = { key, pk, t };
      feedRingHead = (feedRingHead + 1) % FEED_RING_CAP;
    }
  }
  function hasRecentFeedIntent(key: string, pk: string, now: number): boolean {
    for (const e of feedRing) {
      if (e.key === key && e.pk === pk && now - e.t <= FEED_MATCH_WINDOW_MS) {
        return true;
      }
    }
    return false;
  }

  // Memoized `table → resourceKey[]` inverse of the L3 read-set hook. The read-set
  // index only grows (lazy capture, never evicts), so a cheap (entryCount,
  // totalReadSetSize) signature is a sufficient staleness key — rebuild only when
  // either changes. Built by iterating the registry and calling `opts.readSet`.
  let tableToResourcesCache: Map<string, string[]> | null = null;
  let tableToResourcesSig = "";
  function tableToResources(): Map<string, string[]> {
    let totalSize = 0;
    const perKey: Array<[string, string[]]> = [];
    for (const entry of registry.values()) {
      const tables = opts.readSet?.(entry.key) ?? [];
      totalSize += tables.length;
      perKey.push([entry.key, tables]);
    }
    const sig = `${registry.size}:${totalSize}`;
    if (tableToResourcesCache && sig === tableToResourcesSig) {
      return tableToResourcesCache;
    }
    const inverse = new Map<string, string[]>();
    for (const [key, tables] of perKey) {
      for (const table of tables) {
        const list = inverse.get(table);
        if (list) list.push(key);
        else inverse.set(table, [key]);
      }
    }
    tableToResourcesCache = inverse;
    tableToResourcesSig = sig;
    return inverse;
  }

  // The set of base tables whose change a resource can absorb through a SINGLE
  // authoritative scoped path — its own `identityTable` plus, transitively, the
  // identityTables reachable through its `affectedMap`/`dependsOn` edges. Used by
  // `applyDbChange`: a feed change whose `origin` is in this set is delivered via
  // exactly one path (the identity view, or the edge that translates it), so a
  // secondary view-fanout FULL can never absorb the scoped delivery. Memoized on
  // registry size — identity/edges are fixed at registration, so the closure only
  // changes when an entry is added.
  let coveredOriginsCache: Map<string, Set<string>> | null = null;
  let coveredOriginsSig = -1;
  function coveredOriginsFor(key: string): Set<string> {
    if (!coveredOriginsCache || coveredOriginsSig !== registry.size) {
      const cache = new Map<string, Set<string>>();
      const visiting = new Set<string>();
      const compute = (k: string): Set<string> => {
        const memo = cache.get(k);
        if (memo) return memo;
        if (visiting.has(k)) return new Set(); // cycle guard (bug — warned in rebuildDag)
        visiting.add(k);
        const entry = registry.get(k);
        const out = new Set<string>();
        if (entry) {
          if (entry.identityTable) out.add(entry.identityTable);
          for (const up of entry.upstreamKeys) {
            for (const o of compute(up)) out.add(o);
          }
        }
        visiting.delete(k);
        cache.set(k, out);
        return out;
      };
      for (const k of registry.keys()) compute(k);
      coveredOriginsCache = cache;
      coveredOriginsSig = registry.size;
    }
    return coveredOriginsCache.get(key) ?? new Set();
  }

  // console.error ALWAYS fires here; the report hook is additive.
  function reportLoaderError(context: string, err: unknown): void {
    console.error(`[resources] ${context}`, err);
    opts.reportError?.(context, err);
  }

  function paramsKey(params: ResourceParams): string {
    const keys = Object.keys(params).sort();
    const obj: ResourceParams = {};
    for (const k of keys) obj[k] = params[k]!;
    return JSON.stringify(obj);
  }

  // Internal refill primitive — the ONLY place `entry.loader` runs. The loader
  // output is parsed against the resource's schema before it leaves this
  // function, so every load path (sub-ack, push/keyed/scoped notify, HTTP
  // fallback) is validated at one chokepoint — a schema violation throws here and
  // is handled by each caller's loader-failure path (report + skip the send).
  // Keyed Layer-2 scoped loads return a partial array, which still satisfies the
  // `z.array(Element)` schema. `wrapLoad` (server: recordEntrySpan) also
  // establishes the ambient parent context so DB queries issued inside the loader
  // attribute to it. Private to `getResourceValue` + the keyed reseed below; all
  // read call sites go through `getResourceValue`.
  function timedLoad(
    entry: RegistryEntry,
    params: ResourceParams,
    ctx?: { affectedIds: readonly string[] },
  ): Promise<unknown> {
    const run = async () => entry.schema.parse(await entry.loader(params, ctx));
    return opts.wrapLoad ? opts.wrapLoad(entry.key, run) : run();
  }

  // The single read accessor. Full loads (ctx === undefined: sub-ack, HTTP
  // fallback, loadResourceByKey, plain notify-reload) share ONE in-flight loader
  // promise per (key, params), collapsing the multi-tab / GET-races-sub herd. The
  // shared parsed value is treated as IMMUTABLE by every coalesced caller (all
  // current consumers are read-only). inflight clears the key the instant the
  // promise settles, so the next load is fresh — error/staleness sharing is safe.
  // Single-flight wraps OUTSIDE the loader semaphore (the semaphore lives in
  // wrapLoad, inside timedLoad) so a deduped caller never consumes a gate slot.
  //
  // Scoped keyed-delta loads (ctx.affectedIds, Layer 2) return a PARTIAL array and
  // NEVER coalesce: a plain subscriber must not attach to a partial load (torn
  // snapshot), and two scoped loads with different affectedIds are not the same
  // work. They run the refill directly.
  function getResourceValue(
    entry: RegistryEntry,
    params: ResourceParams,
    ctx?: { affectedIds: readonly string[] },
  ): Promise<unknown> {
    if (ctx) return timedLoad(entry, params, ctx);
    return inflight.run(`${entry.key} ${paramsKey(params)}`, () => timedLoad(entry, params));
  }

  // Coalesce an incoming notify into the pending map for one pk, applying the
  // FULL-absorbing union: a null `incoming` (or an existing FULL) sticks the pk
  // at FULL; otherwise the incoming ids union into the existing scoped set.
  function mergePending(
    map: Map<string, PendingNotify>,
    pk: string,
    params: ResourceParams,
    incoming: Set<string> | null,
  ): void {
    const existing = map.get(pk);
    if (!existing) {
      // First merge: stamp the staleness-window start. Never overwritten below.
      map.set(pk, {
        params,
        affected: incoming === null ? null : new Set(incoming),
        enqueuedAt: performance.now(),
      });
      return;
    }
    if (existing.affected === null) return; // FULL absorbs everything
    if (incoming === null) {
      existing.affected = null; // degrade to FULL
      return;
    }
    for (const id of incoming) existing.affected.add(id);
  }

  // Single internal builder. Produces the full runtime object (with a working
  // `notify` either way) and registers the entry. `defineResource` returns it
  // typed as `Resource` (notify present at runtime but hidden by the type, so a
  // DB-backed resource can't be hand-notified); `defineExternalResource` returns
  // the same object typed as `ExternalResource` and marks the entry external.
  function createResource<T, P extends ResourceParams = ResourceParams>(
    def: ResourceDefinition<T, P>,
    externalSource: boolean,
  ): ExternalResource<T, P> {
    if (registry.has(def.key)) {
      throw new Error(`defineResource: duplicate key "${def.key}"`);
    }
    const mode = def.mode ?? "invalidate";
    if (!def.schema) {
      throw new Error(`defineResource: a schema is required for key "${def.key}"`);
    }
    if (mode === "keyed" && !def.keyOf) {
      throw new Error(
        `defineResource: mode "keyed" requires a keyOf for key "${def.key}"`,
      );
    }
    const upstreamKeys: string[] = [];
    const ownDownstreamEdges: Array<{ upstreamKey: string; edge: DownstreamEdge }> = [];
    for (const dep of def.dependsOn ?? []) {
      upstreamKeys.push(dep.resource.key);
      ownDownstreamEdges.push({
        upstreamKey: dep.resource.key,
        edge: {
          downstreamKey: def.key,
          map: dep.map as
            | ((
                upstreamParams: ResourceParams,
                upstreamValue: unknown,
              ) => ResourceParams[])
            | undefined,
          affectedMap: dep.affectedMap as
            | ((
                upstreamAffected: ReadonlySet<string>,
                upstreamParams: ResourceParams,
              ) => Promise<string[]> | string[])
            | undefined,
        },
      });
    }
    const entry: RegistryEntry = {
      key: def.key,
      mode,
      externalSource,
      schema: def.schema as ZodType<unknown>,
      loader: def.loader as (
        params: ResourceParams,
        ctx?: { affectedIds: readonly string[] },
      ) => Promise<unknown> | unknown,
      keyOf: def.keyOf as ((row: unknown) => string) | undefined,
      identityTable: def.identityTable,
      recompute: def.recompute,
      snapshots: mode === "keyed" ? new Map() : undefined,
      versions: new Map(),
      pendingNotifies: new Map(),
      debounceMs: def.debounceMs,
      subCounts: new Map(),
      upstreamKeys,
      downstream: [],
      onFirstSubscribe: def.onFirstSubscribe as
        | ((params: ResourceParams) => void | Promise<void>)
        | undefined,
      onLastUnsubscribe: def.onLastUnsubscribe as
        | ((params: ResourceParams) => void)
        | undefined,
    };
    registry.set(def.key, entry);

    // Wire this entry as a downstream of its upstreams. Upstreams must be
    // defined before their downstreams — otherwise the upstream's registry
    // entry doesn't exist yet. Warned lazily during DAG rebuild.
    for (const { upstreamKey, edge } of ownDownstreamEdges) {
      const upstream = registry.get(upstreamKey);
      if (upstream) upstream.downstream.push(edge);
    }
    dagDirty = true;

    return {
      key: def.key,
      mode,
      schema: def.schema,
      async load(params: P): Promise<T> {
        // Parse here too: this handle method is the one load path that bypasses
        // `timedLoad`, so it must validate to keep the guarantee total.
        return def.schema.parse(await def.loader(params));
      },
      notify(params?: P, opts?: { affectedIds?: string[] }): void {
        const affected = opts?.affectedIds ? new Set(opts.affectedIds) : null;
        scheduleNotify(entry, (params ?? ({} as P)) as ResourceParams, affected);
      },
    };
  }

  // DB-backed resource: the runtime object carries a `notify` method, but the
  // returned type hides it (`Resource` has no `notify`), so hand-notifying a
  // DB-backed resource is a compile error — the change-feed drives it instead.
  //
  // Two call shapes (see the `ResourceRuntime` interface): the flat strict
  // `DefineResourceInput` (keyed ⇒ scope policy mandatory) and the
  // `(contract, serverOpts)` form that reads key/schema/keyed-ness off a shared
  // client descriptor so server and client can't disagree about them. Both widen
  // back to the loose `ResourceDefinition` that `createResource` registers.
  function defineResource<T, P extends ResourceParams = ResourceParams>(
    def: DefineResourceInput<T, P>,
  ): Resource<T, P>;
  function defineResource<T, P extends ResourceParams = ResourceParams>(
    contract: KeyedResourceContract<T, P>,
    opts: ServerResourceOptions<T, P> & ScopePolicy,
  ): Resource<T, P>;
  function defineResource<T, P extends ResourceParams = ResourceParams>(
    contract: ResourceContract<T, P>,
    opts: ServerResourceOptions<T, P>,
  ): Resource<T, P>;
  function defineResource<T, P extends ResourceParams = ResourceParams>(
    a: DefineResourceInput<T, P> | ResourceContract<T, P>,
    opts?: ServerResourceOptions<T, P> & {
      identityTable?: string;
      recompute?: { kind: "full"; reason: string };
    },
  ): Resource<T, P> {
    const def = opts
      ? contractToDefinition(a as ResourceContract<T, P>, opts)
      : (a as ResourceDefinition<T, P>);
    return createResource(def, false);
  }

  // Escape-hatch resource (truth outside Postgres): exposes a callable `notify`.
  function defineExternalResource<T, P extends ResourceParams = ResourceParams>(
    def: ResourceDefinition<T, P>,
  ): ExternalResource<T, P> {
    return createResource(def, true);
  }

  // Rebuild the topological order and warn on cycles or dangling upstream refs.
  // Called lazily — amortised to flushNotifies and the debug endpoint.
  function rebuildDag(): void {
    if (!dagDirty) return;
    dagDirty = false;

    const order: RegistryEntry[] = [];
    const state = new Map<string, "visiting" | "done">();
    const cycles: string[][] = [];

    const visit = (entry: RegistryEntry, stack: string[]): void => {
      const s = state.get(entry.key);
      if (s === "done") return;
      if (s === "visiting") {
        const i = stack.indexOf(entry.key);
        cycles.push(stack.slice(i >= 0 ? i : 0).concat(entry.key));
        return;
      }
      state.set(entry.key, "visiting");
      stack.push(entry.key);
      // Post-order: every upstream's depth is finalized before we read it here.
      // Longest-path depth = 1 + max upstream depth (0 for a root). `?? 0` keeps
      // dangling-upstream (skipped) and cycle (back-edge, depth not yet set)
      // cases finite and crash-free — matching the warn-only phase-1 semantics.
      let depth = 0;
      for (const upKey of entry.upstreamKeys) {
        const up = registry.get(upKey);
        if (!up) {
          console.warn(
            `[resources] "${entry.key}" depends on unknown resource "${upKey}" (upstream not yet defined at ${entry.key}'s registration time?)`,
          );
          continue;
        }
        visit(up, stack);
        depth = Math.max(depth, (up.depth ?? 0) + 1);
      }
      stack.pop();
      entry.depth = depth;
      state.set(entry.key, "done");
      order.push(entry);
    };

    for (const entry of registry.values()) visit(entry, []);

    if (cycles.length > 0) {
      for (const cycle of cycles) {
        // Phase 1: warn only. Phase 3 promotes this to a hard failure.
        console.warn(`[resources] dependsOn cycle detected: ${cycle.join(" -> ")}`);
      }
    }

    topoOrder = order;
    // Group by depth. Post-order is not depth-sorted across independent subtrees,
    // so build the levels explicitly rather than slicing `order`.
    const maxDepth = order.reduce((m, e) => Math.max(m, e.depth ?? 0), 0);
    const levels: RegistryEntry[][] = Array.from({ length: maxDepth + 1 }, () => []);
    for (const e of order) levels[e.depth ?? 0]!.push(e);
    topoLevels = levels;
  }

  // --- Broadcast machinery ---

  function subscribersFor(key: string, pk: string): SocketState[] {
    const out: SocketState[] = [];
    for (const st of sockets.values()) {
      const inner = st.subs.get(key);
      if (inner?.has(pk)) out.push(st);
    }
    return out;
  }

  function sendJson(ws: ServerWebSocket<WsData>, obj: unknown): void {
    try {
      ws.send(JSON.stringify(obj));
    // eslint-disable-next-line promise-safety/no-bare-catch
    } catch {
      // close handler will clean up
    }
  }

  // Schedule a single global microtask flush, guarded so concurrent callers
  // coalesce onto one flush. The immediate (non-debounced) path.
  function scheduleFlush(): void {
    if (flushScheduled) return;
    flushScheduled = true;
    queueMicrotask(() => { void flushNotifies(); });
  }

  async function withNotifyBatch<T>(fn: () => Promise<T>): Promise<T> {
    batchDepth++;
    try {
      return await fn();
    } finally {
      batchDepth--;
      if (batchDepth === 0 && !flushScheduled) {
        for (const entry of registry.values()) {
          if (entry.pendingNotifies.size > 0) {
            scheduleFlush();
            break;
          }
        }
      }
    }
  }

  function scheduleNotify(
    entry: RegistryEntry,
    params: ResourceParams,
    affected: Set<string> | null,
    opts?: { source?: "hand" | "feed" },
  ): void {
    const pk = paramsKey(params);
    // Self-verification recorder (cascade is byte-identical regardless of source).
    const source = opts?.source ?? "hand";
    const now = performance.now();
    const stats = statsFor(entry.key);
    if (source === "feed") {
      stats.feed++;
      stats.lastFeedAt = now;
      recordFeedIntent(entry.key, pk, now);
    } else {
      stats.hand++;
      stats.lastHandAt = now;
      // A hand-notify with no recent feed intent for the same (resource, pk)
      // means the change-feed did NOT cover this change — i.e. the L3 read-set
      // capture is missing a table this resource reads. That is exactly the bug
      // class L4 eliminates, so surface it (loud, but not an error — the parallel
      // run is expected to find these during the migration).
      if (!hasRecentFeedIntent(entry.key, pk, now)) {
        console.warn(
          `[live-state] read-set-gap candidate: hand-notify for "${entry.key}" pk=${pk} had no matching change-feed intent within ${FEED_MATCH_WINDOW_MS}ms (a table this resource reads may be missing from the L3 read-set)`,
        );
      }
    }
    mergePending(entry.pendingNotifies, pk, params, affected);
    if (batchDepth > 0) return;
    // Debounced entries do not ride the immediate flush: arm a per-entry
    // fixed-window timer (only if not already armed — never re-armed within a
    // window, so a continuously-ticking source still flushes every debounceMs).
    if (entry.debounceMs) {
      if (entry.debounceTimer === undefined) {
        entry.debounceTimer = setTimeout(() => {
          entry.debounceTimer = undefined;
          scheduleFlush();
        }, entry.debounceMs);
      }
      return;
    }
    scheduleFlush();
  }

  // Build the id→hash map for a keyed resource's array value. The hash is the
  // row's canonical JSON string — a fast non-crypto identity over the full row
  // (including nested arrays like an attempt's `conversations`). Shared by
  // `diffKeyed` and `handleSub` so both sides compute identity identically.
  function snapshotOf(entry: RegistryEntry, value: unknown): Map<string, string> {
    const keyOf = entry.keyOf;
    if (!keyOf) {
      throw new Error(`[resources] keyed resource "${entry.key}" missing keyOf`);
    }
    if (!Array.isArray(value)) {
      throw new Error(
        `[resources] keyed resource "${entry.key}" loader must return an array`,
      );
    }
    return buildSnapshot(value, keyOf);
  }

  // Diff the new array `value` against the stored snapshot for `pk`, then REPLACE
  // that snapshot with the freshly computed id→hash map. `hadSnapshot` is false
  // only when there was no prior snapshot entry for `pk` (first notify) — callers
  // send a full update in that case so brand-new clients get a complete base.
  function diffKeyed(entry: RegistryEntry, pk: string, value: unknown): KeyedDiff {
    const keyOf = entry.keyOf;
    if (!keyOf) {
      throw new Error(`[resources] keyed resource "${entry.key}" missing keyOf`);
    }
    if (!Array.isArray(value)) {
      throw new Error(
        `[resources] keyed resource "${entry.key}" loader must return an array`,
      );
    }
    const snapshots = (entry.snapshots ??= new Map());
    const { diff, nextSnapshot } = diffKeyedFull(snapshots.get(pk), value, keyOf);
    snapshots.set(pk, nextSnapshot);
    return diff;
  }

  // Scoped diff (Layer 2): `scopedRows` is a PARTIAL array — only the recomputed
  // affected rows. We MERGE them into the existing snapshot (never replace it):
  // each changed row becomes an upsert and its hash is written back; rows not in
  // `scopedRows` are left intact (no upsert). `deletes` is necessarily empty and
  // `order` is unchanged — a scoped notify never asserts membership/order, so a
  // concurrently-deleted row is corrected by the delete site's own FULL notify.
  // Precondition: a snapshot for `pk` already exists (caller only enters the
  // scoped path when `hadSnapshot`).
  function diffKeyedScoped(
    entry: RegistryEntry,
    pk: string,
    scopedRows: unknown[],
  ): { upserts: [string, unknown][] } {
    const keyOf = entry.keyOf;
    if (!keyOf) {
      throw new Error(`[resources] keyed resource "${entry.key}" missing keyOf`);
    }
    const snapshots = (entry.snapshots ??= new Map());
    const snap = snapshots.get(pk);
    if (!snap) {
      throw new Error(
        `[resources] diffKeyedScoped called for "${entry.key}" pk "${pk}" with no snapshot`,
      );
    }
    const { upserts, nextSnapshot } = diffKeyedScopedPure(snap, scopedRows, keyOf);
    snapshots.set(pk, nextSnapshot);
    return { upserts };
  }

  async function flushNotifies(): Promise<void> {
    // Single-active-flush mutex: never overlap two flushes. A notify that lands
    // while a flush is mid-await sets `flushAgain`; the live flush re-drains so
    // mid-flush arrivals are never stranded.
    if (flushRunning) {
      flushAgain = true;
      return;
    }
    flushRunning = true;
    try {
      // Run the whole drain inside the injected flush wrapper (server:
      // recordEntrySpan("flush", ...)) so each cycle is one `flush` entry and the
      // per-resource `push` loads it triggers nest under it (byParent =
      // head-of-line blocking attribution). Identity passthrough on central.
      if (opts.wrapFlush) await opts.wrapFlush(runFlushCycle);
      else await runFlushCycle();
    } finally {
      flushRunning = false;
    }
  }

  // One flush cycle: re-drains while mid-flush notifies set `flushAgain`. Each
  // depth level runs concurrently; a barrier between levels so every cascade
  // merged into a (strictly-deeper) downstream settles before that downstream
  // level drains. A slow loader can no longer head-of-line-block an unrelated
  // entry at the same or an earlier depth.
  async function runFlushCycle(): Promise<void> {
    do {
      flushAgain = false;
      flushScheduled = false;
      rebuildDag();
      for (const level of topoLevels) {
        await Promise.all(level.map(drainEntry));
      }
    } while (flushAgain);
  }

  // Drain one entry's pending notifies: load (await), send frames, cascade.
  // Begins with a synchronous snapshot+clear of pending and a debounce-timer
  // cancel, so concurrent sibling entries in the same level never tear each
  // other's state and every cascade this entry emits has settled before the
  // next (deeper) level reads it. The per-pk loop stays sequential — the version
  // and keyed snapshot for a single (key,pk) must advance monotonically.
  async function drainEntry(entry: RegistryEntry): Promise<void> {
    if (entry.pendingNotifies.size === 0) return;
    const pending = Array.from(entry.pendingNotifies.values());
    entry.pendingNotifies.clear();
    // Piggyback: this entry's pending is being drained now (possibly by a flush
    // some other resource scheduled), so cancel any armed debounce timer — it
    // would otherwise fire redundantly on an already-empty pending map.
    if (entry.debounceTimer !== undefined) {
      clearTimeout(entry.debounceTimer);
      entry.debounceTimer = undefined;
    }
    for (const pendingEntry of pending) {
      const { params, affected } = pendingEntry;
      const pk = paramsKey(params);
      // Scoped notify (Layer 2): `affected !== null` means recompute only those
      // row ids. An empty scoped set = nothing actually changed → skip the send
      // entirely (no version bump, no empty delta, no cascade).
      const scoped = affected !== null;
      if (scoped && affected.size === 0) continue;
      const version = (entry.versions.get(pk) ?? 0) + 1;
      entry.versions.set(pk, version);
      const subs = subscribersFor(entry.key, pk);

      // Compute value once if either a subscriber (push mode) or any
      // value-aware downstream `map` needs it. For invalidate-mode upstreams
      // we still compute when a map wants it — rare today, acceptable cost.
      // `affectedMap` self-queries the DB and must NOT force the value, else we
      // reintroduce the full upstream load Layer 2 is removing.
      const hasValueAwareDownstream = entry.downstream.some((d) => d.map !== undefined);
      const needValue =
        ((entry.mode === "push" || entry.mode === "keyed") && subs.length > 0) ||
        hasValueAwareDownstream;
      const ctx = scoped ? { affectedIds: [...affected] } : undefined;
      let value: unknown;
      let valueComputed = false;
      if (needValue) {
        try {
          // Origin = the push/cascade flush: re-establishes an entry context
          // (this runs in a bare microtask with no ambient context) so the
          // loader span attributes to this `push` instead of `parent: null`.
          value = await (opts.wrapOrigin
            ? opts.wrapOrigin("push", entry.key, () => getResourceValue(entry, params, ctx))
            : getResourceValue(entry, params, ctx));
          valueComputed = true;
        } catch (err) {
          reportLoaderError(`loader failed for ${entry.key}`, err);
          // Skip sending and cascading on loader failure — otherwise we'd
          // invalidate downstream state based on a torn read.
          continue;
        }
      }

      if (subs.length > 0) {
        if (entry.mode === "invalidate") {
          const msg = { kind: "invalidate" as const, key: entry.key, params, version };
          for (const s of subs) sendJson(s.ws, msg);
        } else if (entry.mode === "keyed") {
          // `value` is guaranteed computed (needValue is true for keyed + subs).
          const hadSnapshot = entry.snapshots?.has(pk) ?? false;
          if (scoped && !hadSnapshot) {
            // Near-unreachable: a subscribed pk always seeded a snapshot at
            // sub-ack. If we somehow get here, the scoped `value` is partial and
            // unsafe for diffKeyed — reload the FULL value and diff that.
            let full: unknown;
            try {
              full = await (opts.wrapOrigin
                ? opts.wrapOrigin("push", entry.key, () => getResourceValue(entry, params, undefined))
                : getResourceValue(entry, params, undefined));
            } catch (err) {
              reportLoaderError(`loader failed for ${entry.key}`, err);
              continue;
            }
            // hadSnapshot was false ⇒ ship a full update base. diffKeyed here
            // serves only to (re)seed the snapshot from the full value.
            diffKeyed(entry, pk, full);
            const msg = {
              kind: "update" as const,
              key: entry.key,
              params,
              value: full,
              version,
            };
            for (const s of subs) sendJson(s.ws, msg);
            opts.onPush?.(entry.key, { subscribers: subs.length, changed: true });
          } else if (scoped) {
            // Scoped path: merge the partial recompute into the snapshot and
            // ship only the changed rows. `deletes:[]`, `order:undefined` —
            // a scoped notify never asserts membership/order (those stay FULL).
            const { upserts } = diffKeyedScoped(entry, pk, value as unknown[]);
            if (upserts.length) {
              const msg = {
                kind: "delta" as const,
                key: entry.key,
                params,
                upserts,
                deletes: [] as string[],
                order: undefined,
                version,
              };
              for (const s of subs) sendJson(s.ws, msg);
            }
            // Emit regardless of whether a frame was sent: the recompute happened,
            // so an empty scoped diff (upserts.length === 0) is a recorded no-op push.
            opts.onPush?.(entry.key, { subscribers: subs.length, changed: upserts.length > 0 });
          } else {
            // FULL path (unchanged from Layer 1). diffKeyed replaces the stored
            // snapshot only here, after the loader succeeded — the loader-failure
            // `continue` above leaves it untouched.
            const { upserts, deletes, order } = diffKeyed(entry, pk, value);
            if (!hadSnapshot) {
              // First notify for this pk: ship a full update so brand-new
              // subscribers get a complete base to merge subsequent deltas onto.
              const msg = { kind: "update" as const, key: entry.key, params, value, version };
              for (const s of subs) sendJson(s.ws, msg);
              opts.onPush?.(entry.key, { subscribers: subs.length, changed: true });
            } else {
              const msg = {
                kind: "delta" as const,
                key: entry.key,
                params,
                upserts,
                deletes,
                order,
                version,
              };
              for (const s of subs) sendJson(s.ws, msg);
              opts.onPush?.(entry.key, {
                subscribers: subs.length,
                changed: upserts.length > 0 || deletes.length > 0 || order !== undefined,
              });
            }
          }
        } else {
          const msg = { kind: "update" as const, key: entry.key, params, value, version };
          for (const s of subs) sendJson(s.ws, msg);
        }
      }

      // Delivery latency (enqueue → ws.send) charged to this resource under the
      // active `flush` entry (server: recordSpan("push", `deliver:<key>`)). Only
      // when a subscriber actually received a frame. Identity no-op on central.
      if (subs.length > 0) {
        opts.onDelivered?.(entry.key, performance.now() - pendingEntry.enqueuedAt, subs.length);
      }

      for (const edge of entry.downstream) {
        const down = registry.get(edge.downstreamKey);
        if (!down) continue;
        let derived: ResourceParams[];
        if (edge.map) {
          try {
            derived = edge.map(params, valueComputed ? value : undefined);
          } catch (err) {
            reportLoaderError(
              `dependsOn map failed (${entry.key} → ${edge.downstreamKey})`,
              err,
            );
            continue;
          }
        } else {
          derived = [params];
        }
        // Compute the downstream affected set. Upstream FULL ⇒ FULL; no
        // affectedMap ⇒ FULL; a throwing affectedMap fails safe to FULL. Never
        // silently narrows a membership change.
        let downAffected: Set<string> | null;
        if (affected === null) {
          downAffected = null;
        } else if (!edge.affectedMap) {
          downAffected = null;
        } else {
          try {
            downAffected = new Set(await edge.affectedMap(affected, params));
          } catch (err) {
            reportLoaderError(
              `affectedMap failed (${entry.key} → ${edge.downstreamKey})`,
              err,
            );
            downAffected = null;
          }
        }
        for (const dp of derived) {
          mergePending(down.pendingNotifies, paramsKey(dp), dp, downAffected);
        }
      }
    }
  }

  // --- WS handler ---

  const notificationsWsHandler: WsHandler = {
    open(ws) {
      sockets.set(ws, { ws, subs: new Map() });
      const timer = setInterval(() => sendJson(ws, { kind: "ping" }), HEARTBEAT_MS);
      heartbeats.set(ws, timer);
    },
    message(ws, raw) {
      const state = sockets.get(ws);
      if (!state) return;
      let msg: unknown;
      try {
        msg = JSON.parse(typeof raw === "string" ? raw : raw.toString());
      } catch (err) {
        if (!(err instanceof SyntaxError)) throw err;
        return;
      }
      if (!msg || typeof msg !== "object") return;
      const m = msg as {
        op?: string;
        kind?: string;
        id?: number;
        key?: string;
        params?: ResourceParams;
      };
      if (m.kind === "pong") return;
      if (m.op === "sub") {
        void handleSub(state, m);
        return;
      }
      if (m.op === "unsub") {
        handleUnsub(state, m);
        return;
      }
    },
    close(ws) {
      const timer = heartbeats.get(ws);
      if (timer) clearInterval(timer);
      heartbeats.delete(ws);
      const state = sockets.get(ws);
      if (state) {
        for (const [key, inner] of state.subs) {
          for (const [pk, params] of inner) releaseSubRefcount(key, pk, params);
        }
      }
      sockets.delete(ws);
    },
  };

  async function handleSub(
    state: SocketState,
    m: { id?: number; key?: string; params?: ResourceParams },
  ): Promise<void> {
    const { id, key, params = {} } = m;
    if (!key) return;
    const entry = registry.get(key);
    if (!entry) {
      sendJson(state.ws, { kind: "sub-error", id, key, reason: "unknown-key" });
      return;
    }
    const pk = paramsKey(params);
    let inner = state.subs.get(key);
    if (!inner) {
      inner = new Map();
      state.subs.set(key, inner);
    }
    const alreadyHeldBySocket = inner.has(pk);
    inner.set(pk, params);
    if (!alreadyHeldBySocket) {
      const prev = entry.subCounts.get(pk) ?? 0;
      entry.subCounts.set(pk, prev + 1);
      if (prev === 0 && entry.onFirstSubscribe) {
        try {
          await entry.onFirstSubscribe(params);
        } catch (err) {
          reportLoaderError(`onFirstSubscribe failed for ${key}`, err);
        }
      }
    }

    let value: unknown;
    try {
      // Origin = the subscription: establishes an entry context so the loader
      // span (and any gate waits it charges) is attributed to this `sub` request
      // instead of running with `parent: null`.
      value = await (opts.wrapOrigin
        ? opts.wrapOrigin("sub", key, () => getResourceValue(entry, params))
        : getResourceValue(entry, params));
    } catch (err) {
      reportLoaderError(`loader failed for ${key}`, err);
      sendJson(state.ws, { kind: "sub-error", id, key, reason: "loader-failed" });
      return;
    }
    // Report the CURRENT version without bumping: a sub-ack delivers existing
    // state, it is not a state change. Bumping here made the version climb on
    // every (re)subscribe, which broke the missed-update watchdog — the probe
    // re-subscribes every sub, so the version always appeared to advance even
    // when nothing was missed. Mirrors handleResourceHttp (also unbumped). The
    // version advances only in flushNotifies. A never-notified pk reports 0; the
    // client's -1 "nothing applied yet" baseline still accepts that sub-ack.
    const version = entry.versions.get(pk) ?? 0;
    // Keyed entries: seed the per-pk snapshot from the full sub-ack value so the
    // next notify can diff against it. The sub-ack itself stays full-value.
    if (entry.mode === "keyed") {
      (entry.snapshots ??= new Map()).set(pk, snapshotOf(entry, value));
    }
    sendJson(state.ws, { kind: "sub-ack", id, key, params, value, version });
  }

  function handleUnsub(
    state: SocketState,
    m: { key?: string; params?: ResourceParams },
  ): void {
    const { key, params = {} } = m;
    if (!key) return;
    const inner = state.subs.get(key);
    if (!inner) return;
    const pk = paramsKey(params);
    if (!inner.has(pk)) return;
    inner.delete(pk);
    if (inner.size === 0) state.subs.delete(key);
    releaseSubRefcount(key, pk, params);
  }

  function releaseSubRefcount(key: string, pk: string, params: ResourceParams): void {
    const entry = registry.get(key);
    if (!entry) return;
    const prev = entry.subCounts.get(pk) ?? 0;
    if (prev <= 0) return;
    const next = prev - 1;
    if (next === 0) {
      entry.subCounts.delete(pk);
      // Bound keyed-snapshot memory to actively-observed pks. Re-subscribe
      // re-hydrates via a full sub-ack and rebuilds the snapshot.
      entry.snapshots?.delete(pk);
      if (entry.onLastUnsubscribe) {
        try {
          entry.onLastUnsubscribe(params);
        } catch (err) {
          reportLoaderError(`onLastUnsubscribe failed for ${key}`, err);
        }
      }
    } else {
      entry.subCounts.set(pk, next);
    }
  }

  // --- HTTP handler ---

  /** GET /api/resources/:key?foo=bar — returns {value, version}. */
  async function handleResourceHttp(
    req: Request,
    params: Record<string, string>,
  ): Promise<Response> {
    const key = params.key;
    if (!key) return new Response("Not found", { status: 404 });
    if (key === "_debug") return handleResourcesDebug();
    const entry = registry.get(key);
    if (!entry) return new Response("Unknown resource", { status: 404 });

    const url = new URL(req.url);
    const resourceParams: ResourceParams = {};
    for (const [k, v] of url.searchParams) resourceParams[k] = v;

    let value: unknown;
    try {
      value = await getResourceValue(entry, resourceParams);
    } catch (err) {
      reportLoaderError(`loader failed for ${key}`, err);
      return new Response("Loader failed", { status: 500 });
    }
    const pk = paramsKey(resourceParams);
    const version = entry.versions.get(pk) ?? 0;
    return new Response(JSON.stringify({ value, version }), {
      headers: { "content-type": "application/json" },
    });
  }

  function handleResourcesDebug(): Response {
    rebuildDag();
    const ownerByKey = new Map<string, { pluginId?: string }>();
    for (const c of opts.debugOwners?.() ?? []) {
      ownerByKey.set(c.key, { pluginId: c.pluginId });
    }
    const out: Array<{
      key: string;
      mode: ResourceMode;
      pluginId?: string;
      subscribers: number;
      subCounts: Record<string, number>;
      versions: Record<string, number>;
      dependsOn: string[];
      downstream: string[];
      readSet: string[];
      readSetBases: string[];
      identityTable?: string;
      recompute?: { kind: "full"; reason: string };
      coveredOrigins: string[];
      loaderStats?: { count: number; ratePerMin: number; maxMs: number };
      notifyStats: { hand: number; feed: number };
      externalSource: boolean;
    }> = [];
    for (const entry of registry.values()) {
      let subscribers = 0;
      for (const st of sockets.values()) {
        const inner = st.subs.get(entry.key);
        if (inner) subscribers += inner.size;
      }
      const owner = ownerByKey.get(entry.key);
      // The raw captured read-set (the VIEW/table names loaders actually read)
      // AND its base-resolved projection (views → their identity base), so the
      // ceiling can compare like-for-like with `coveredOrigins` (base-table
      // space) while the captured index keeps the raw names. `resolveRelation` is
      // identity on central (no derived views there).
      const rawReadSet = opts.readSet?.(entry.key) ?? [];
      const resolve = opts.resolveRelation ?? ((r) => r);
      const readSetBases = [...new Set(rawReadSet.map(resolve))].sort();
      out.push({
        key: entry.key,
        mode: entry.mode,
        pluginId: owner?.pluginId,
        subscribers,
        // Authoritative per-pk server subscriber count (the diff fan-out factor):
        // how many tabs receive a delta for each params-tuple.
        subCounts: Object.fromEntries(entry.subCounts),
        versions: Object.fromEntries(entry.versions),
        dependsOn: entry.upstreamKeys,
        downstream: entry.downstream.map((d) => d.downstreamKey),
        // Automatic table read-set captured at the DB chokepoint (server-only
        // hook; absent on central). Diffed against dependsOn in the debug pane to
        // surface latent stale-UI gaps and over-broad cascade edges.
        readSet: rawReadSet,
        // The read-set resolved into base-table space (views → identity base) for
        // the ceiling's like-for-like comparison against `coveredOrigins`.
        readSetBases,
        // Declared scope policy: the resource's own `identityTable` (intent to be
        // scoped) and its explicit `recompute: full` opt-out (a deliberate FULL,
        // not a degradation). The read-set debug pane uses both to tell a silent
        // FULL apart from a declared one.
        identityTable: entry.identityTable,
        recompute: entry.recompute,
        // The authoritative scoped-vs-FULL routing set: the base tables whose
        // change this resource can absorb through a single scoped path — its own
        // `identityTable` ∪ the transitive identityTables reachable via its
        // `affectedMap`/`dependsOn` edges. A read-set table OUTSIDE this set
        // silently FULL-recomputes the resource (`coveredOriginsFor`, ~564).
        coveredOrigins: [...coveredOriginsFor(entry.key)].sort(),
        // Loader frequency over the profiling window (server-only hook; absent on
        // central). Surfaces a cheap-but-hot loader the slow-single-call view misses.
        loaderStats: opts.loaderStats?.(entry.key),
        // L4 self-verification: how many notifies came from hand-`notify()` vs the
        // DB change-feed. A resource with `hand > 0, feed === 0` is a read-set-gap
        // candidate (the feed isn't covering a table this resource reads).
        notifyStats: (() => {
          const s = notifyStats.get(entry.key);
          return { hand: s?.hand ?? 0, feed: s?.feed ?? 0 };
        })(),
        // Declared classification: was this resource defined via
        // `defineExternalResource` (truth outside Postgres)? The
        // `no-db-backed-notify` check reads this to forbid a DB-reading loader on
        // an external resource.
        externalSource: entry.externalSource ?? false,
      });
    }
    return new Response(
      JSON.stringify(
        { topoOrder: topoOrder.map((e) => e.key), resources: out },
        null,
        2,
      ),
      { headers: { "content-type": "application/json" } },
    );
  }

  // Load any registered resource by key through the same `timedLoad` path
  // `handleSub` uses (schema parse + profiler span). Throws on an unknown key.
  function loadResourceByKey(
    key: string,
    params?: ResourceParams,
  ): Promise<unknown> {
    const entry = registry.get(key);
    if (!entry) throw new Error(`unknown resource key: ${key}`);
    return getResourceValue(entry, params ?? {});
  }

  // Distinct currently-subscribed params tuples for a resource key, recovered
  // from every socket's `subs` map (the `ResourceParams` objects are stored there
  // at sub time). Deduped by pk across sockets.
  function subscribedParamsFor(key: string): ResourceParams[] {
    const byPk = new Map<string, ResourceParams>();
    for (const st of sockets.values()) {
      const inner = st.subs.get(key);
      if (!inner) continue;
      for (const [pk, params] of inner) {
        if (!byPk.has(pk)) byPk.set(pk, params);
      }
    }
    return [...byPk.values()];
  }

  // --- L4 DB change-feed routing ---

  // Route one DB change into the recompute cascade. Pure mapping: invert the L3
  // read-set, decide each resource's scope, fan out to subscribed params
  // (param-less → {}), and route through the existing `scheduleNotify` tagged
  // "feed". Defensive: an unknown table (no resource reads it yet) is a silent
  // no-op; never throws.
  //
  // `table` is the relation the read-set matched (a base table OR a view the
  // change-feed forwarded onto). `origin` is the BASE table that actually
  // changed; `identityBase` is the identity base of `table` (a 1:1 PK-preserving
  // view maps to its base; any other relation is its own identity). These let the
  // runtime route a covered change through ONE authoritative path so a secondary
  // view-fanout FULL can't absorb a scoped delivery. See
  // research/2026-06-20-global-scoped-recompute-default.md.
  function applyDbChange(change: {
    table: string;
    op: "I" | "U" | "D";
    ids: string[] | null;
    origin: string;
    identityBase: string;
  }): void {
    try {
      const affectedKeys = tableToResources().get(change.table);
      if (!affectedKeys || affectedKeys.length === 0) {
        // Unknown/unread table — no resource depends on it (yet). Debug-level,
        // not warn: this is expected for tables no loader has read.
        return;
      }
      // A single-row UPDATE with ids scopes to those rows (Layer-2 `WHERE id IN
      // (…)`); INSERT/DELETE, a null/empty id list, or an over-cap statement is a
      // membership/order change that can't be a scoped set → FULL.
      const scopable = change.op === "U" && change.ids != null && change.ids.length > 0;
      const scopedAffected: Set<string> | null = scopable ? new Set(change.ids!) : null;

      for (const key of affectedKeys) {
        const entry = registry.get(key);
        if (!entry) continue;

        // Per-resource scope decision (the unifying rule: an affectedMap edge /
        // the resource's own identity view takes precedence over any other
        // read-set match for the same origin).
        let affected: Set<string> | null;
        if (coveredOriginsFor(key).has(change.origin)) {
          if (change.origin === entry.identityTable) {
            // Identity-origin change: the identity view is the authoritative path.
            // Drop a duplicate arriving via a SECONDARY view so it can't FULL the
            // scoped identity delivery.
            if (change.identityBase !== entry.identityTable) continue;
            affected = scopedAffected;
          } else {
            // Edge-covered origin: an affectedMap edge delivers it (scoped) via
            // the DAG cascade. Drop EVERY feed delivery for this origin so it
            // can't absorb that scoped path.
            continue;
          }
        } else {
          // Uncovered dependency (no identity/edge for this origin): coarse but
          // correct — recompute the whole resource.
          affected = null;
        }

        // Build the RecomputeIntent (the shared L4 contract). Today it is routed
        // straight through `scheduleNotify`; a future work-admission scheduler
        // consumes it on the admit side. Construct it so the producer side is the
        // stable contract surface.
        const delta: RecomputeIntent["delta"] =
          affected !== null ? { table: change.table, ids: [...affected], op: "U" } : "FULL";

        const subscribed = subscribedParamsFor(key);
        // Fan out to every subscribed params tuple. A param-less resource is
        // always covered (key = {}); a parametrized resource with no current
        // subscribers admits nothing (a fresh subscribe loads from scratch).
        const targets: ResourceParams[] =
          subscribed.length > 0 ? subscribed : [{}];
        for (const params of targets) {
          const intent: RecomputeIntent = { resource: key, key: params, delta };
          void intent;
          scheduleNotify(entry, params, affected, { source: "feed" });
        }
      }
    } catch (err) {
      // Never throw out of the feed router — a parse/lookup bug must not take down
      // the LISTEN consumer. console.error fires (loud), plus the report hook.
      reportLoaderError(`applyDbChange failed for table "${change.table}"`, err);
    }
  }

  function notifyStatsFor(key: string): { hand: number; feed: number } {
    const s = notifyStats.get(key);
    return { hand: s?.hand ?? 0, feed: s?.feed ?? 0 };
  }

  return {
    defineResource,
    defineExternalResource,
    notificationsWsHandler,
    handleResourceHttp,
    withNotifyBatch,
    loadResourceByKey,
    applyDbChange,
    notifyStatsFor,
  };
}
