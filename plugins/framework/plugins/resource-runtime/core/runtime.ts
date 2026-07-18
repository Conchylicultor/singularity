import type { ServerWebSocket } from "bun";
import type { ZodType } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { createInflight } from "@plugins/packages/plugins/inflight/core";
import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
import {
  buildSnapshot,
  diffKeyedFull,
  diffKeyedScoped as diffKeyedScopedPure,
  diffKeyedScopedMembership,
  hashSnapEncoder,
  retainSnapEncoder,
  type KeyedDiff,
  type SnapEncoder,
  type SnapEntry,
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
// type) it imports only the `packages/inflight` and `packages/semaphore` leaves
// (globally-allowed utility code, so no cycle — inflight for read-path
// single-flight coalescing, semaphore for the read-admission gate). It declares
// its own local WsData/WsHandler interfaces
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
  delta: { table: string; ids: string[]; op: "I" | "U" | "D"; xid?: string } | "FULL";
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
  /**
   * Relevance gate for a SCOPED cascade (Layer 2). Given the changed upstream
   * row ids, return id→signature capturing ONLY the upstream fields THIS
   * downstream actually derives from. The runtime remembers the last signature
   * per id and forwards an id to `affectedMap` only when its signature changed
   * (or it is new / unknown). Transient upstream fields the downstream ignores —
   * e.g. a conversation's `waitingFor`/`updatedAt`, which the tasks/attempts
   * aggregates never read — thus stop triggering downstream no-op recomputes at
   * the source, instead of recomputing-then-diffing-to-empty on every write.
   *
   * Like `affectedMap`, it MUST self-query the DB (never read the upstream
   * value, so it does not force the upstream loader). Consulted ONLY on scoped
   * cascades; a FULL cascade (insert/delete/bulk/reconnect) bypasses it AND
   * clears the remembered signatures, so the next scoped change always
   * re-propagates rather than comparing against a pre-FULL signature. An id
   * absent from the returned map is treated as changed (fail-safe). Omit for the
   * default: cascade on every delivered id.
   */
  signature?: (
    upstreamAffected: ReadonlySet<string>,
    // biome-ignore lint/suspicious/noExplicitAny: upstream params type is erased — see above.
    upstreamParams: any,
  ) => Promise<Map<string, string>> | Map<string, string>;
}

/**
 * Bounded-membership selector for a keyed own-identity resource — the
 * generalization of M5 `scopedMembership` to the bounded working-set contract
 * (`research/2026-07-18-global-bounded-working-set-resource-contract.md`). A
 * membership entry's per-(params) value is a BOUNDED subset of the collection,
 * maintained incrementally: a feed change costs O(changed) + O(window), never
 * O(collection).
 *
 * - `kind: "window"` — the params tuple names an ordered window (`WHERE … ORDER
 *   BY … LIMIT n`). `windowIdsOf(params)` is the ids-only bounded ordered id
 *   list for that window — the authority the runtime consults on any potential
 *   membership change (an entrant candidate or a leaver) to re-derive the
 *   window and pull the new tail row in. It MUST carry the window's LIMIT (a
 *   bounded read); the loader at the same params must be the matching windowed
 *   query, so a FULL recompute of a window entry is bounded by construction.
 * - `kind: "point"` — the params tuple names an explicit id set. `idsOf(params)`
 *   decodes it (pure, synchronous, cheap — it runs per subscribed tuple on the
 *   feed-routing path). The entry's loader is the scoped read over those ids; a
 *   feed change routes to a tuple iff the changed ids intersect its set. No ids
 *   query ever runs; point sets are unordered (entrants append).
 *
 * Declaring `membership` requires `mode: "keyed"` + `identityTable` (enforced
 * with a loud throw, exactly like `scopedMembership`) and marks the entry as
 * BOUNDED: it is excluded from L2 persistence (`live_state_snapshot`) and its
 * keyed snapshot uses the compact hash encoder. The legacy
 * `scopedMembership: { orderOf }` is a thin alias for an UNBOUNDED window
 * (`windowIdsOf = orderOf`, no LIMIT) that keeps the persisted-reconstruction
 * path and the retain encoder — byte-identical to M5. The two fields are
 * mutually exclusive.
 */
export type KeyedMembership<P extends ResourceParams = ResourceParams> =
  | {
      kind: "window";
      windowIdsOf: (params: P) => Promise<string[]>;
      /**
       * Order signature of one wire row: a canonical encoding of exactly the
       * fields the window's ORDER BY reads (pure, cheap — compared for equality
       * only). When present, a refilled MEMBER row whose signature differs from
       * the stored one is treated as membership-affecting: the window is
       * re-derived via `windowIdsOf` (one bounded ids query) and the delta
       * asserts the fresh `order` — so an UPDATE that moves an order column
       * (e.g. a `createdAt` resurface bump) reorders the wire window instead of
       * leaving it stale. Unchanged-signature refills keep the in-place path
       * (no ids query — the M5 cost model for content-only bumps). Absent ⇒
       * in-place updates never re-derive order (byte-identical prior behavior;
       * the ORDER BY must then be update-stable).
       */
      orderSignatureOf?: (row: unknown) => string;
    }
  | { kind: "point"; idsOf: (params: P) => readonly string[] };

/**
 * The runtime-internal normalized membership record: the public `membership`
 * field plus the `scopedMembership` alias fold into this one shape, so every
 * consumer (routing, drain, encoder, persistence gate) branches on it alone.
 * `bounded: false` marks the legacy alias — the only unbounded window — which
 * keeps L2 persistence and the retain snapshot encoder.
 */
type MembershipRecord =
  | {
      kind: "window";
      windowIdsOf: (params: ResourceParams) => Promise<string[]>;
      bounded: boolean;
      /** Order-signature seam — see `KeyedMembership`. Never set on the alias. */
      orderSignatureOf?: (row: unknown) => string;
    }
  | { kind: "point"; idsOf: (params: ResourceParams) => readonly string[] };

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
   * and the resource quietly stays on FULL recompute. This is enforced at boot:
   * the change-feed's `assertScopePoliciesCovered` throws if this table is not one
   * it installed a trigger on (a view / rollup / excluded / typo'd name), so the
   * silent degrade is now a loud boot failure rather than a latent footgun.
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
   * Opt-in row-level membership scoping (M5) for a keyed resource. When present,
   * an INSERT/DELETE/where-flip on the resource's identity table no longer forces
   * a FULL recompute: the runtime refills only the changed rows and reconciles
   * membership against the per-pk snapshot, shipping an incremental delta that
   * asserts the new `order`. `orderOf` is the ids-only "full ORDER BY'd id list
   * for these params" query the runtime runs ONLY when a row ENTERS membership
   * (an exit or in-place change derives its order from the prior snapshot, so no
   * query runs). It is an injected closure so `resource-runtime` stays DB-free.
   *
   * Requires `mode: "keyed"` + `identityTable` (an own-identity scoped resource) —
   * enforced with a loud throw in `createResource`, so it is incompatible with the
   * `recompute: { full }` opt-out (which has no identityTable). Absent ⇒
   * byte-identical to the pre-M5 FULL-on-membership-change behavior. Also relaxes
   * the mutable-`where` rule (a where-flip is detected as an exit/entry). See
   * research/2026-07-03-global-scoped-membership-m5.md.
   */
  scopedMembership?: { orderOf: (params: P) => Promise<string[]> };
  /**
   * Bounded-membership selector (window / point) — see `KeyedMembership`. The
   * generalization of `scopedMembership` (which remains as the unbounded-window
   * alias); the two are mutually exclusive. Requires `mode: "keyed"` +
   * `identityTable`, enforced with a loud throw in `createResource`. A
   * membership-bounded entry is never L2-persisted and its snapshot uses the
   * hash encoder.
   */
  membership?: KeyedMembership<P>;
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
  /**
   * Conditional-revalidation signature (HTTP-ETag / 304 semantics). Optional and
   * opt-in: when present, a cheap "did anything change?" content signature (an
   * ETag) the read path (WS sub-ack + HTTP GET fallback) can compare against the
   * client's last-known value BEFORE running the full loader. On a match the
   * server answers "still current" (a WS `up-to-date` frame / an HTTP `304`)
   * without recomputing, and the client keeps its cached value — collapsing the
   * post-restart resubscribe herd for unchanged resources. It MUST be a
   * conservative over-approximation (≪ the loader in cost, and a fresh/unique
   * value whenever any loader input it cannot cheaply hash might have changed):
   * an occasional needless recompute is fine, serving stale is not. Runs on the
   * read path only, under the same read-admission gate as the loader (it may
   * spawn git/fs). Absent ⇒ today's full-loader behavior, unchanged.
   */
  revalidate?: (params: P) => Promise<string>;
  /**
   * Subscription-authorization seam (deferred; single-instance-per-user). Runs
   * on the subscribe path — before the refcount bump, `onFirstSubscribe`, and
   * the loader — and, if it resolves falsy, refuses the subscription with a
   * `sub-error` (`reason: "unauthorized"`) instead of an initial value.
   *
   * Absent ⇒ the subscription is always allowed. That is the shipped behavior
   * for every resource today: under the one-instance-per-user deployment model
   * (`research/2026-07-02-global-adr-single-instance-per-user.md`) there is
   * exactly one trusted caller, so no resource populates this. The field exists
   * so the authorization boundary is an explicit, typed seam rather than an
   * implicit hole — a future authenticated-gateway / multi-tenant deployment can
   * enforce per-subscription access here without reshaping the sub path. The
   * callback takes only `params` today (the resource key is fixed per entry, and
   * no caller identity is threaded through the socket yet); widening it with a
   * caller-context argument later is a non-breaking additive change.
   *
   * DECLARING IT CURRENTLY THROWS AT REGISTRATION: only the WS subscribe path
   * enforces it — `handleResourceHttp` would serve the value unchecked (and the
   * client heals a `sub-error` via an HTTP refetch), a silent authorization
   * bypass. The guard in `createResource` refuses the declaration until HTTP
   * parity exists; build one shared admission check across handleSub /
   * handleSubBatch / handleResourceHttp, then delete the guard and restore the
   * WS-enforcement tests from history.
   */
  authorize?: (params: P) => boolean | Promise<boolean>;
  /**
   * Boot-critical marker, threaded from the shared client descriptor through the
   * two-arg `defineResource`/`defineExternalResource` form onto the returned
   * `Resource`. Pure metadata: it does not affect loader/registry behavior — it
   * only lets `Resource.Declare` derive the flag instead of restating it.
   */
  bootCritical?: true;
  /**
   * Opt into STANDALONE mutation-ack frames (`{ kind: "ack" }`). Every
   * feed-driven value frame (`update` / `delta`) carries `ackTx` — the source
   * transaction ids folded into the recompute — unconditionally (free bytes, no
   * extra frames). But a recompute that produces NO value change (an empty
   * scoped diff, a membership net-zero / window-boundary skip, a point
   * empty-intersection) normally ships nothing, which would leave an optimistic
   * client's exact-ack confirmation hanging until an unrelated frame. Declaring
   * `ackChannel: true` makes those paths broadcast a version-less
   * `{ kind: "ack", key, params, ackTx }` frame instead: no cache write, no
   * version bump, no snapshot touch, no cascade — pure ack delivery. Opt-in
   * per resource because only optimistic-mutation consumers need it. See
   * research/2026-07-18-global-bounded-working-set-phase2.md Part C.
   */
  ackChannel?: true;
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
 * The strict public input to the flat one-arg `defineResource` (the runtime
 * keeps the loose `ResourceDefinition` internally). This form is
 * **push/invalidate-only**: a keyed resource cannot be declared this way. Keyed-ness
 * comes SOLELY from the two-arg `defineResource(descriptor, opts)` overload, which
 * derives it from the shared client `KeyedResourceContract` descriptor — so the
 * client always carries the matching `keyOf`. This structurally removes the
 * "server says keyed, client forgot its keyOf → browser crash" class. `push`/
 * `invalidate` resources may still optionally set `identityTable` (e.g. a push
 * aggregate that propagates scoped ids downstream). `defineExternalResource` is
 * deliberately NOT constrained — keyed external resources have no DB feed to scope
 * against. See
 * research/2026-06-20-global-enforce-keyed-resource-scope-coverage.md.
 */
export type DefineResourceInput<T, P extends ResourceParams = ResourceParams> =
  Omit<
    ResourceDefinition<T, P>,
    | "mode"
    | "keyOf"
    | "identityTable"
    | "recompute"
    | "scopedMembership"
    | "membership"
    | "bootCritical"
  > & {
    mode?: "push" | "invalidate";
    identityTable?: string;
  };

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
  /**
   * Boot-critical marker, declared once on the shared client descriptor. Threaded
   * through onto the returned `Resource` so `Resource.Declare` derives its payload
   * from it instead of restating it in server-side opts. See the descriptor in
   * `@plugins/primitives/plugins/live-state/core`.
   */
  bootCritical?: true;
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
  /**
   * Opt-in row-level membership scoping (M5) — see
   * `ResourceDefinition.scopedMembership`. Only meaningful on the KEYED overload
   * (its `ScopePolicy` supplies the required `identityTable`); `createResource`
   * throws if it is set without keyed mode + identityTable.
   */
  scopedMembership?: ResourceDefinition<T, P>["scopedMembership"];
  /**
   * Bounded-membership selector (window / point) — see `KeyedMembership`. Only
   * meaningful on the KEYED overload (its `ScopePolicy` supplies the required
   * `identityTable`); mutually exclusive with `scopedMembership`.
   */
  membership?: ResourceDefinition<T, P>["membership"];
  debounceMs?: number;
  onFirstSubscribe?: ResourceDefinition<T, P>["onFirstSubscribe"];
  onLastUnsubscribe?: ResourceDefinition<T, P>["onLastUnsubscribe"];
  /** Conditional-revalidation ETag signature — see `ResourceDefinition.revalidate`. */
  revalidate?: ResourceDefinition<T, P>["revalidate"];
  /** Deferred subscription-authorization seam — see `ResourceDefinition.authorize`. */
  authorize?: ResourceDefinition<T, P>["authorize"];
  /** Standalone mutation-ack frames — see `ResourceDefinition.ackChannel`. */
  ackChannel?: ResourceDefinition<T, P>["ackChannel"];
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
    bootCritical: contract.bootCritical,
    loader: opts.loader,
    dependsOn: opts.dependsOn,
    identityTable: opts.identityTable,
    recompute: opts.recompute,
    scopedMembership: opts.scopedMembership,
    membership: opts.membership,
    debounceMs: opts.debounceMs,
    onFirstSubscribe: opts.onFirstSubscribe,
    onLastUnsubscribe: opts.onLastUnsubscribe,
    revalidate: opts.revalidate,
    authorize: opts.authorize,
    ackChannel: opts.ackChannel,
  };
}

export interface Resource<T, P extends ResourceParams = ResourceParams> {
  key: string;
  mode: ResourceMode;
  schema: ZodType<T>;
  /**
   * Boot-critical marker, derived from the shared client descriptor (via the
   * two-arg `defineResource`/`defineExternalResource` form). `Resource.Declare`
   * reads it to build its contribution payload — the single source of truth.
   */
  bootCritical?: true;
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
  /** Relevance gate (see DependsOnEntry.signature). Undefined = cascade every id. */
  signature?: (
    upstreamAffected: ReadonlySet<string>,
    upstreamParams: ResourceParams,
  ) => Promise<Map<string, string>> | Map<string, string>;
  /**
   * Per-upstream-id memory of the last signature forwarded through this edge,
   * owned by the runtime. Compared against `signature()` to drop scoped cascades
   * whose downstream-relevant projection is unchanged. Cleared on a FULL cascade
   * (the new values weren't observed, so a stale entry could wrongly skip the
   * next scoped change back to a pre-FULL signature).
   */
  lastSignatures: Map<string, string>;
}

// A coalesced pending notify for one params-tuple. `affected === null` means
// FULL recompute (sticky/absorbing): once a flush has any id-less contributor
// the pk stays FULL. A non-null Set scopes the recompute to those row ids.
interface PendingNotify {
  params: ResourceParams;
  affected: Set<string> | null;
  /**
   * op-D row ids (M5 `scopedMembership` only). Set ONLY for a scopedMembership
   * entry's DELETE — `affected` then carries no id for them (a deleted row cannot
   * be refilled), so `deleted` is the separate channel that drives the membership
   * diff's exit path. Absorbed/dropped by a FULL contributor exactly like
   * `affected` (see `mergePending`). Undefined for every non-membership pending, so
   * the legacy scoped/FULL paths are byte-identical.
   */
  deleted?: Set<string>;
  /**
   * `performance.now()` of the FIRST notify that opened this pending entry — the
   * moment the resource became stale. Set only in the `!existing` branch of
   * `mergePending` and NEVER overwritten on re-merge (coalesce / debounce re-arm
   * / cascade re-merge all route through `mergePending`), so the delivery-latency
   * window measures real staleness from first notify to send, not ~0. Read once
   * in `flushNotifies` to compute `onDelivered` latency.
   */
  enqueuedAt: number;
  /**
   * Source transaction ids (`pg_current_xact_id()::text` from the change-feed
   * NOTIFY) of the DB changes coalesced into this pending — the mutation-ack
   * attribution (`ackTx`) the drain stamps on the frames this recompute
   * produces. Unioned on EVERY merge branch, INCLUDING the FULL absorb/degrade
   * (a FULL recompute reads post-commit, so the "W's rows have been re-read"
   * claim survives the scope degrade — contrast `deleted`, which FULL drops).
   * Absent for hand-`notify()` / synthetic pendings (no HTTP mutation
   * corresponds), so those frames are structurally ack-less.
   */
  sourceTx?: Set<string>;
  /**
   * The union above crossed `SOURCE_TX_CAP` — ship NO ackTx this cycle (the set
   * is cleared: a missing ack is safe, degrading to the client's watermark
   * backstop; a torn set could confirm an op whose rows were never re-read).
   */
  sourceTxOverflow?: boolean;
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
   * Normalized membership record (see `MembershipRecord`): the public
   * `membership` selector or the legacy `scopedMembership` alias (an unbounded
   * window, `bounded: false`). Present ⇒ `applyDbChange` scopes INSERT/DELETE
   * (not just UPDATE) to this resource's own keys and `drainEntry` runs the
   * incremental membership path (`diffKeyedScopedMembership`) instead of a FULL
   * recompute. Undefined ⇒ the pre-M5 FULL-on-membership-change behavior
   * (byte-identical). See research/2026-07-03-global-scoped-membership-m5.md
   * and research/2026-07-18-global-bounded-working-set-resource-contract.md.
   */
  membership?: MembershipRecord;
  /**
   * Per-pk snapshot of id→SnapEntry for keyed entries. Allocated lazily only
   * when `mode === "keyed"`. Lets the diff ship only changed rows. Evicted
   * per-pk on the N→0 sub transition so memory is bounded to actively-observed
   * pks. The entry representation is per-resource (see `snapEncoderFor`): a
   * 64-bit content hash by default, the full canonical JSON string for
   * `scopedMembership` entries (their persist path parses it back).
   */
  snapshots?: Map<string, Map<string, SnapEntry>>;
  /**
   * Per-pk order-signature map (member id → order signature) for a window
   * membership entry that declared `orderSignatureOf`. Tiny — window-sized, one
   * short string per member. Lifecycle identical to `snapshots`: seeded/replaced
   * wherever the keyed snapshot is (sub-ack seed, membership FULL rebuild),
   * maintained in lockstep by the incremental membership path, evicted with the
   * snapshot on the N→0 sub transition. Undefined for every other entry.
   */
  orderSigs?: Map<string, Map<string, string>>;
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
  /**
   * Conditional-revalidation ETag signature (see `ResourceDefinition.revalidate`).
   * Undefined ⇒ the resource has not opted in and every read path runs the full
   * loader exactly as before.
   */
  revalidate?: (params: ResourceParams) => Promise<string>;
  /**
   * Deferred subscription-authorization seam (see `ResourceDefinition.authorize`).
   * Undefined ⇒ every subscription to this resource is allowed (the shipped
   * single-instance-per-user behavior). When present, `handleSub` awaits it
   * before any side effect and refuses the sub with `sub-error`/`unauthorized`
   * if it resolves falsy.
   */
  authorize?: (params: ResourceParams) => boolean | Promise<boolean>;
  /**
   * Standalone mutation-ack frames opt-in (see `ResourceDefinition.ackChannel`).
   * Undefined ⇒ no-value-change recomputes ship nothing (today's behavior);
   * value-frame `ackTx` stamping is unconditional either way.
   */
  ackChannel?: true;
}

/**
 * One socket-held subscription record for a (key, paramsKey): the params object
 * plus WHICH tabs behind this socket hold it. The shared-WebSocket client is one
 * socket for N tabs and every tab sends its own sub frames, so a socket's sub set
 * is the UNION of its tabs'. Tagging each pk with its holders lets one tab depart
 * (`op:"unsub-tab"`, or a `sub-batch complete:true` reconciliation) without
 * tearing down subs the other tabs still hold — before this, a closed follower
 * tab's subs leaked until the whole socket cycled. Legacy untagged frames land in
 * the `""` bucket and release only on socket close (the pre-tab behavior).
 * `entry.subCounts` still bumps only on the socket-level 0→1 (pk record created /
 * deleted), and frames are still sent once per socket per pk.
 */
interface SocketSubRecord {
  params: ResourceParams;
  tabs: Set<string>;
}

interface SocketState {
  ws: ServerWebSocket<WsData>;
  /** key -> paramsKey -> record (subscriptions this socket holds, tagged by tab). */
  subs: Map<string, Map<string, SocketSubRecord>>;
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
  wrapOrigin?: <R>(
    kind: "sub" | "push" | "cascade",
    key: string,
    fn: () => Promise<R>,
  ) => Promise<R>;
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
  /**
   * Report queue-wait at the read-admission gate (see `READ_LOAD_CONCURRENCY`).
   * Fired once per gated read-path load/revalidate at slot acquisition with the
   * ms spent queueing (≈0 when a slot was free), mirroring the DB loader gate's
   * `onWait`. server: `chargeWait("read-admit", ms)` — attributes the wait to the
   * enclosing `sub` entry so a saturated gate is visible in the profiler;
   * central / before-injection: omitted (no-op). */
  onReadGateWait?: (waitMs: number) => void;
  /**
   * Report queue-wait at the read-path single-flight coalescer (see
   * `getResourceValue`). Fired once per JOINING full load — a caller that found
   * an existing in-flight loader promise for the same (key, params) — with the
   * ms spent awaiting the shared flight (the starter never reports), mirroring
   * the read-admission gate's `onReadGateWait`. server:
   * `chargeWait("read-coalesce", ms)` — attributes the wait to the enclosing
   * entry so time spent coalesced behind another caller's slow loader is
   * visible in the profiler; central / before-injection: omitted (no-op). */
  onCoalesceWait?: (waitMs: number) => void;
  /**
   * Fired once per version short-circuit — a `sub` whose echoed (epoch, version)
   * matched the server's current boot epoch + per-pk version counter and was
   * answered `up-to-date` with NO loader run and NO read-admission slot (see
   * `handleSub`). The runtime also keeps its own per-key counter, surfaced in the
   * `_debug` payload next to `notifyStats`, for live re-validation of the
   * replay-storm fix. server: optional metric hook; central / omitted: no-op.
   */
  onSubShortCircuit?: (key: string) => void;
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
   * The tables the resource's MOST RECENT loader run read (per-run capture,
   * REPLACED each run — not the append-only union `readSet` returns), or
   * `undefined` if none was captured. Used ONLY on the L2 persist seam: after a
   * FULL recompute, the runtime persists THIS into `tables_read` (replace, not
   * union) so a dependency a code change removed — or a historical mis-attribution
   * baked into the seed — is shed instead of carried forever. It is authoritative
   * because every persisted resource FULL-recomputes wholesale, so its last run
   * observed the complete current table set (there are no data-dependent
   * conditional queries among persisted resources — the safety basis; see
   * research/2026-07-07-global-read-set-self-heal-on-full-recompute.md).
   *
   * Deliberately does NOT feed `applyDbChange`'s live routing — that keeps using
   * the union `readSet`, an over-approximation, so a stale extra edge only causes a
   * wasteful recompute, never a missed live delivery. server: getLastLoaderReadSet();
   * central: omitted (undefined → the persist falls back to `readSet`).
   */
  lastReadSet?: (key: string) => string[] | undefined;
  /**
   * Map a captured read-set relation to its identity base table, so the debug
   * ceiling compares like-for-like with `coveredOrigins` (stated in base-table
   * space): a view-backed loader records the VIEW (`conversations_v`), but
   * coveredOrigins names the base (`conversations`). server: relationIdentityBase
   * (resolves declared identity views, else identity); central: omitted (identity).
   */
  resolveRelation?: (relation: string) => string;
  /**
   * Feed-exempt base tables: trigger-maintained materialized rollups
   * (derived-tables) that a loader reads but the change-feed deliberately does
   * NOT install NOTIFY triggers on (a rollup is a pure read-cache fed by its
   * source's change). The `_debug` builder subtracts these from the emitted
   * read-set so a rollup never shows as a false "silent FULL recompute" (a
   * read-set base outside `coveredOrigins`) in the Debug → Read-set pane — the
   * source-driven scoped path already covers the change. server: injected at
   * boot by change-feed (reads the current holder at call time); central /
   * before-injection: omitted (empty set, no filtering). See
   * research/2026-06-23-global-agent-launches-incremental-materialization.md §8.
   */
  feedExemptTables?: () => Set<string>;
  /**
   * L2 persisted materialization — true when this resource key should be
   * persisted to `live_state_snapshot` for instant cold boot. Backed by
   * `bootCritical && !externalSource` (the boot-critical, DB-backed set). When it
   * returns true, `drainEntry` captures the xmin watermark BEFORE the loader runs,
   * forces a FULL recompute even with zero subscribers, and persists the value on
   * loader success. server: injected by the live-state-snapshot plugin at boot
   * (reads the current holder at call time); central / before-injection: omitted
   * (no resource is persisted). See
   * research/2026-06-22-global-live-state-l2-persisted-materialization.md §3.3.
   */
  shouldPersist?: (key: string) => boolean;
  /**
   * Capture the durable monotonic position (the xmin watermark). Called BEFORE
   * the loader's first read, so any write not visible to the loader's snapshot
   * has xid >= this watermark. server:
   * `SELECT pg_snapshot_xmin(pg_current_snapshot())::text` through the pool.
   * Two callers, same floor semantics:
   *  - the L2 persist path (when `shouldPersist(key)` is true) — the persisted
   *    value's catch-up floor (under-replay impossible; over-replay harmless);
   *  - every FULL read/recompute flight (`getResourceValue`) — the commit
   *    watermark stamped on the frames that fully reconcile a client (sub-ack /
   *    update / FULL keyed delta / HTTP body, Rule B′), which the optimistic
   *    client compares against mutation ack tokens (Rule A/B). See
   *    research/2026-07-11-global-never-revert-optimistic-edits.md.
   * Absent (central) ⇒ frames ship tokenless and nothing is persisted.
   */
  captureWatermark?: () => Promise<string>;
  /**
   * Persist a freshly-recomputed FULL value to `live_state_snapshot` under
   * (key, paramsKey) with its captured watermark. Called only on loader SUCCESS
   * (never on the failure/continue path), so the snapshot is never torn. server:
   * `INSERT … ON CONFLICT (resource_key, params_key) DO UPDATE`. Only invoked
   * when `shouldPersist(key)` is true.
   */
  persistSnapshot?: (
    key: string,
    paramsKey: string,
    value: unknown,
    watermark: string,
    tablesRead: readonly string[],
  ) => Promise<void>;
}

export interface ResourceRuntime {
  /**
   * Declare a DB-backed resource. Two shapes:
   *
   * - Flat `(def)` — the strict `DefineResourceInput`, which is
   *   **push/invalidate-only**: a `mode: "keyed"` flat resource is unrepresentable.
   *   Keyed-ness can only be declared via the two-arg form below.
   * - Two-arg `(contract, serverOpts)` — derives `key`/`schema`/keyed-ness from
   *   the shared client descriptor so server and client can't drift. A KEYED
   *   contract requires a `ScopePolicy` in `serverOpts` (the scope-coverage
   *   invariant lives entirely here — there is no flat keyed form to skip it);
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
      contract: ResourceContract<T, P> & { keyed?: never },
      opts: ServerResourceOptions<T, P>,
    ): Resource<T, P>;
  };
  /**
   * Like `defineResource`, but the returned handle exposes a callable `notify()`.
   * For escape-hatch resources whose truth lives outside Postgres (the DB
   * change-feed can never reach them). Sets `entry.externalSource = true` for the
   * backstop check + `_debug` payload. See
   * research/2026-06-20-global-remove-hand-notify-dependson.md §2.
   *
   * Two shapes, mirroring `defineResource`:
   *
   * - Flat `(def)` — the loose `ResourceDefinition` (external resources are not
   *   held to the `ScopePolicy` invariant — they have no DB feed to scope against).
   * - Two-arg `(contract, serverOpts)` — derives `key`/`schema`/keyed-ness AND
   *   `bootCritical` from the shared client descriptor so server and client can't
   *   drift, exactly like `defineResource`'s two-arg form.
   */
  defineExternalResource: {
    <T, P extends ResourceParams = ResourceParams>(
      def: ResourceDefinition<T, P>,
    ): ExternalResource<T, P>;
    <T, P extends ResourceParams = ResourceParams>(
      contract: ResourceContract<T, P>,
      opts: ServerResourceOptions<T, P>,
    ): ExternalResource<T, P>;
  };
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
   * Run one full first-subscribe lifecycle for a registered resource and return
   * its timing, then tear it back down. Mirrors `handleSub`'s 0→1 path
   * byte-for-byte — `onFirstSubscribe` then the loader read through the same
   * `getResourceValue` single-flight path — then invokes `onLastUnsubscribe` so
   * the subcount-0 invariants/eviction are restored and a subsequent cold call
   * recomputes. Generic (keyed only by string); the structural home for
   * "simulate one first-subscribe" used by the benchmark harness and future debug
   * tools. Throws on an unknown key (matches `loadResourceByKey`). The hooks fire
   * exactly once each (symmetric), so no dangling subscription/watcher is left.
   */
  measureSubscribeCycle: (
    key: string,
    params?: ResourceParams,
  ) => Promise<{ onFirstSubscribeMs: number; loaderMs: number }>;
  /**
   * Re-emit a registered resource to its current subscribers WITHOUT a DB change:
   * schedules a notify so the loader re-runs and the keyed diff comes back empty,
   * producing a real no-op push. Sibling to `loadResourceByKey`. If `params` is
   * omitted, fans out to every distinct currently-subscribed params tuple for the
   * key. Returns the number of param-tuples scheduled (0 = no subscribers, so the
   * push is unobservable). Throws on an unknown key (fail loudly). Tagged
   * `source: "synthetic"` so it never pollutes the hand-vs-feed counters — the
   * deterministic-churn emitter for the live-state-churn debug pane.
   */
  triggerResourcePush: (key: string, params?: ResourceParams) => number;
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
    /** Source transaction id (xid8 text) — mutation-ack attribution (`ackTx`). */
    xid?: string;
  }) => void;
  /**
   * Force a FULL recompute of a single registered resource by key (param-less →
   * key `{}`), routed through the SAME cascade the feed uses (`source: "feed"`).
   * Used by the L2 boot init to recompute resources that have no usable persisted
   * read-set yet (first boot / newly-added / one-time migration), which persists
   * the value AND populates its read-set for the next boot. A no-op if the key is
   * not registered.
   */
  recomputeResource: (key: string) => void;
  /**
   * Self-verification counters for the `_debug` endpoint: how many notifies for
   * this resource key came from hand-`notify()` (`hand`) vs the DB change-feed
   * (`feed`). Used by the read-set debug pane to surface read-set-gap candidates.
   */
  notifyStatsFor: (key: string) => { hand: number; feed: number };
  /**
   * Occupancy of the read-admission gate (see `READ_LOAD_CONCURRENCY`):
   * currently-held slots, queued waiters, and the cap. The runtime stays
   * profiler-free, so the facade (server-core) registers this as the
   * `read-admit` gate gauge; central omits the registration.
   */
  readGateStats: () => { active: number; queued: number; max: number };
  /**
   * Every registered resource that declared a scoped `identityTable` policy, as
   * `{ key, identityTable }` (entries on `recompute:{full}` or with no scope
   * policy are omitted). The change-feed cross-checks these against its
   * `ExcludeFromChangeFeed` set at boot: a scoped resource whose identity base
   * has no feed trigger can NEVER receive the `origin === identityTable` scoped
   * delivery it declares, so the policy is dead config that silently degrades the
   * resource to hydrate-on-mount with zero signal. The runtime owns the registry;
   * the change-feed owns the exclusion set — this accessor is the seam that lets
   * the change-feed (the DB↔live-state wirer) enforce the invariant without the
   * runtime importing a specific DB plugin.
   */
  scopedResourceIdentities: () => Array<{ key: string; identityTable: string }>;
  /**
   * Every registered resource whose definition is BOUNDED-membership (a bounded
   * `membership: { kind: "window" }` or `{ kind: "point" }`) — the exact set the
   * L2 persist gate (`!membershipBounded`) excludes. The unbounded-window
   * `scopedMembership` alias is NOT bounded, so it is omitted (it keeps
   * persistence). Read straight off the registry's normalized membership record,
   * so it is the same definition-derived predicate the persist gate uses — never
   * a resource-name list. The `live-state-snapshot` boot sweep consumes it to
   * DELETE any leftover persisted rows for a key that USED to persist before it
   * was migrated to the bounded contract (a stale unbounded value would otherwise
   * be served via the L2 boot fast path).
   */
  boundedMembershipKeys: () => string[];
}

const HEARTBEAT_MS = 20_000;

// Read-admission concurrency cap. Bounds how many COLD read-path loads (WS
// sub-ack + HTTP GET fallback) — and the `revalidate` git/fs spawns they may run
// first — execute at once, so no fan-out (boot, a post-restart resubscribe herd,
// or the genuinely-dirty residual after conditional revalidation) can ever
// stampede more than N cold read-loads simultaneously. Orthogonal to the DB
// loader gate (that bounds DB connections; this bounds the whole read-path unit,
// including git/fs-only loaders that issue no query). The push/flush cascade is
// deliberately NOT gated here — it stays level-parallel, bounded by the DB gate.
// Tunable; surfaced via `get_runtime_profile`'s read-admit wait spans.
const READ_LOAD_CONCURRENCY = 6;

// A resource's `revalidate` may return ANY string — long, and with bytes
// (NUL/newline) that are illegal in an HTTP `ETag` header value and unstorable in
// Postgres text (a raw signature set as a header throws `TypeError: Header has
// invalid value`, escaping the handler as a 500). Normalize every signature into
// a compact, opaque, header-safe token by hashing it centrally here — so the
// token is identical across the WS and HTTP paths and every present/future
// resource is protected regardless of what its signature contains. The client
// treats the token as opaque, so hashing is transparent to comparison.
function normalizeEtag(raw: string): string {
  return createHash("sha1").update(raw).digest("hex");
}

// Sentinel returned by a cascade edge's ids-translation closure to signal "this
// edge is irrelevant this flush, skip it" — the closure can't `continue` the
// caller's loop across the wrapOrigin boundary, so it returns this instead.
const SKIP_EDGE = Symbol("skip-edge");

export function createResourceRuntime(opts: ResourceRuntimeOptions = {}): ResourceRuntime {
  const registry = new Map<string, RegistryEntry>();
  const inflight = createInflight();
  // Per-runtime read-admission gate (see READ_LOAD_CONCURRENCY). Its `onWait`
  // charges queue-wait to the enclosing entry via the injected hook (server:
  // chargeWait), so a saturated gate is observable rather than hidden.
  const readLoadGate = createSemaphore(READ_LOAD_CONCURRENCY);
  const chargeReadGateWait = (waitMs: number): void => opts.onReadGateWait?.(waitMs);
  // Identity of THIS server boot, stamped on every sub-ack / up-to-date frame.
  // `entry.versions` is per-boot in-memory state (created empty at registration,
  // bumped only in the flush paths — nothing restores it across restarts), so a
  // client-echoed version is comparable ONLY when the epochs match: same epoch +
  // same version ⇒ for a non-revalidate resource, no state change since the
  // client's value was produced — the per-pk version counter is its complete
  // change signal. See the version short-circuit in `handleSub`.
  const bootEpoch = randomUUID();
  // Per-key count of version short-circuits (a sub answered `up-to-date` from
  // memory: zero loader runs, zero read-admission slots). Monotonic; surfaced in
  // the `_debug` payload next to notifyStats for live re-validation.
  const subShortCircuits = new Map<string, number>();
  function recordSubShortCircuit(key: string): void {
    subShortCircuits.set(key, (subShortCircuits.get(key) ?? 0) + 1);
    opts.onSubShortCircuit?.(key);
  }
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

  // The read-set to persist alongside a FULL value: the tables the loader read on
  // its LAST run (authoritative + self-healing — sheds an edge a code change
  // removed or a historical mis-attribution left behind), falling back to the
  // accumulated union when the per-run capture is unavailable (central runtime, or
  // a scoped-membership persist whose cycle ran no loader). REPLACE semantics: the
  // persist SQL sets `tables_read = EXCLUDED`, so feeding it the per-run set here is
  // what makes the durable seed converge. The in-memory union (`opts.readSet`) is
  // deliberately left untouched — it stays an over-approximation so live
  // `applyDbChange` routing never under-delivers. Must be read SYNCHRONOUSLY right
  // after awaiting the loader; every persisted resource is param-less (single pk),
  // so no concurrent same-key run can clobber the per-run capture in between.
  function persistReadSet(key: string): string[] {
    return opts.lastReadSet?.(key) ?? opts.readSet?.(key) ?? [];
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
  // work. They run the refill directly, and never carry an ETag — a partial value
  // is not a snapshot any signature describes.
  //
  // THE VALUE AND ITS ETAG ARE CO-PRODUCED BY ONE FLIGHT. `seedEtag` is the
  // signature the CALLER probed before asking for the value; the resolved `etag`
  // is the signature the flight that actually produced the value was seeded with.
  // For the STARTER they are the same string. For a JOINER they differ: joiners
  // receive the starter's object and therefore **adopt the starter's seed,
  // discarding their own**. That discard is the whole point.
  //
  // Without it: two `handleSub`s probe their own signatures either side of a
  // change (starter reads S1, joiner reads S2), coalesce onto ONE loader run whose
  // value is the S1 snapshot, and the joiner stamps `(V@S1, S2)` on its sub-ack.
  // Its next revalidation sends S2, the server recomputes S2 from unchanged state
  // and answers `up-to-date`/`304` — and for an `invalidate`-mode resource, whose
  // pushes carry no value, nothing ever heals it. The client holds the stale value
  // FOREVER. Adopting the starter's older seed inverts the error into the safe
  // direction: an ETag describing a snapshot older than its value costs one
  // needless recompute on the next revalidation, and can never serve stale.
  //
  // A flight started by a caller with no seed (push path, `loadResourceByKey`)
  // resolves `etag: undefined`, and every joiner adopts that too — see `handleSub`.
  //
  // THE WATERMARK IS CO-PRODUCED BY THE SAME FLIGHT (Rule B′ — the causal twin of
  // the etag co-production above). The STARTER captures the commit watermark
  // (`opts.captureWatermark`, xid8 xmin) BEFORE `timedLoad`, so it is a valid
  // floor for the value the flight produces: any commit invisible to the loader's
  // snapshot has xid >= it (Rule B). Joiners adopt the starter's whole
  // `{value, etag, watermark}` — a watermark newer than the value it rides with
  // is structurally excluded, exactly like the etag seed adoption. No hook
  // (central runtime) or a throwing hook ⇒ `undefined`: the frame ships
  // tokenless and the optimistic client degrades to content-only confirmation —
  // never a wrong causal denial. A SCOPED load (ctx) is a partial re-read of
  // only the affected rows, so it NEVER carries a watermark: stamping one would
  // let a client treat a partial value as full server truth at that floor.
  // THE ackTx IS CO-PRODUCED BY THE SAME FLIGHT (the third co-production, after
  // the etag and the watermark). `seedAckTx` is the pending's source-transaction
  // ids the CALLER (a feed-driven drain) wants stamped on the frames this value
  // feeds; the resolved `ackTx` is the seed of the flight that ACTUALLY produced
  // the value. A drain that JOINS a read flight whose SELECT may have run
  // pre-commit adopts the starter's (typically undefined) seed and ships NO
  // ackTx — a missed ack degrades to the client's watermark backstop, while
  // stamping its own seed on a pre-commit value would be a FALSE ack (the one
  // soundness hazard the co-production closes). Read-path callers (sub-ack /
  // HTTP / loadResourceByKey) never seed and never stamp ackTx (their snapshot
  // watermark subsumes it). A SCOPED (ctx) load never coalesces (ctx loads
  // bypass the inflight), so returning the seed directly is safe.
  async function getResourceValue(
    entry: RegistryEntry,
    params: ResourceParams,
    ctx?: { affectedIds: readonly string[] },
    seedEtag?: string,
    gated = false,
    seedAckTx?: readonly string[],
  ): Promise<{
    value: unknown;
    etag: string | undefined;
    watermark: string | undefined;
    ackTx: readonly string[] | undefined;
  }> {
    if (ctx) {
      return {
        value: await timedLoad(entry, params, ctx),
        etag: undefined,
        watermark: undefined,
        ackTx: seedAckTx,
      };
    }
    // Gate-after-dedup: when `gated` (the read path), the read-admission slot is
    // acquired INSIDE the single-flight factory, so only the STARTER of a flight
    // ever occupies a slot — N replayed subs of one (key, params) consume 1 slot,
    // not N (the "joiners burn read-admit slots" convoy of
    // research/perfs/2026-07-11-compressor-thrash-subscription-replay-storm.md
    // Finding 3). Joiners ride the EXISTING `read-coalesce` wait
    // (`onCoalesceWait`), which now subsumes the flight's gate wait: a coalesced
    // caller's reported wait includes the starter's time queueing for a slot,
    // charged as coalesce-wait in the joiner's own context — never gate-wait
    // (only the starter runs `chargeReadGateWait`, in its own context, because
    // inflight runs the starter's factory synchronously in its call frame).
    // Push-path callers (`gated` false) start UNGATED flights exactly as before;
    // a gated read joining one rides the coalesce wait with no slot either way.
    // The flight factory: watermark capture FIRST (Rule B — the floor is valid
    // only if captured before the loader's first read), then the loader. Runs
    // only in the STARTER's frame; joiners coalesce onto the resolved object.
    const load = async (): Promise<{
      value: unknown;
      etag: string | undefined;
      watermark: string | undefined;
      ackTx: readonly string[] | undefined;
    }> => {
      let watermark: string | undefined;
      if (opts.captureWatermark) {
        try {
          watermark = await opts.captureWatermark();
        } catch (err) {
          // Tokenless degrade — the value still ships; the client just cannot
          // causally deny against this frame. Loud via the report hook.
          reportLoaderError(`watermark capture failed for ${entry.key}`, err);
        }
      }
      // `ackTx: seedAckTx` — the STARTER's seed; joiners adopt it wholesale
      // (like the etag/watermark), so a stamped ackTx always describes the
      // flight that produced the value it rides with.
      return { value: await timedLoad(entry, params), etag: seedEtag, watermark, ackTx: seedAckTx };
    };
    return inflight.run(
      `${entry.key} ${paramsKey(params)}`,
      gated ? () => readLoadGate.run(load, chargeReadGateWait) : load,
      opts.onCoalesceWait,
    );
  }

  // Run a full loader on the READ path (WS sub-ack + HTTP GET fallback) inside a
  // `sub` origin so the loader span (and the charged gate/coalesce waits)
  // attribute to the subscribe that triggered it. The read-admission gate is
  // applied INSIDE the single-flight (see `getResourceValue`): dedup happens
  // BEFORE admission, so N concurrent reads of one (key, params) consume ONE
  // slot. An earlier version admitted before the dedup on the theory that herd
  // keys are distinct (one per conversation); the 2026-07-11 replay-storm
  // forensics refuted that — chronic full-set sub replays hit the SAME pks from
  // every tab, and each joiner burning a slot behind slow git loaders built the
  // 5,242-deep sub convoy at 9.8s average wait. See
  // research/perfs/2026-07-11-compressor-thrash-subscription-replay-storm.md
  // Finding 3. The push/flush cascade stays ungated (bounded by the DB gate).
  //
  // `seedEtag` is the caller's freshly-probed signature, offered to the flight this
  // call may START. The returned `etag` is the one the flight was actually seeded
  // with — the caller's own iff it started the flight. Callers must stamp the
  // RETURNED etag, never their own (see `getResourceValue`).
  function gatedRead(
    entry: RegistryEntry,
    params: ResourceParams,
    seedEtag?: string,
  ): Promise<{ value: unknown; etag: string | undefined; watermark: string | undefined }> {
    // No ackTx seed and the resolved ackTx is discarded: read-path frames
    // (sub-ack / HTTP body) never carry one — their snapshot watermark subsumes
    // it (Rule B).
    const run = () => getResourceValue(entry, params, undefined, seedEtag, true);
    return opts.wrapOrigin ? opts.wrapOrigin("sub", entry.key, run) : run();
  }

  // Compute a resource's conditional-revalidation ETag under the SAME gate + `sub`
  // origin as a read-path load (the signature may spawn git/fs). Returns undefined
  // when the resource never opted in OR the signature threw — a fail-safe: the
  // caller then falls through to the full loader / omits the ETag, so a broken
  // signature degrades to today's behavior and never serves stale.
  async function computeEtag(
    entry: RegistryEntry,
    params: ResourceParams,
  ): Promise<string | undefined> {
    if (!entry.revalidate) return undefined;
    const revalidate = entry.revalidate;
    try {
      const run = () => readLoadGate.run(() => revalidate(params), chargeReadGateWait);
      const raw = await (opts.wrapOrigin ? opts.wrapOrigin("sub", entry.key, run) : run());
      return normalizeEtag(raw);
    // eslint-disable-next-line promise-safety/no-absorbed-failure -- the loader error IS reported (reportLoaderError); returning undefined skips this push so the live-state sub retains its last-good value (documented stale-safe behavior), never publishing a false empty
    } catch (err) {
      reportLoaderError(`revalidate failed for ${entry.key}`, err);
      return undefined;
    }
  }

  // Compute an ETag on the PUSH/flush path — UNGATED (the cascade is level-
  // parallel, bounded by the DB gate, never the read-admission cap) and
  // attributed to the `push` origin. Rides an `update` frame so the client's
  // stored ETag stays fresh after a push (else its next resubscribe would send a
  // stale ETag and needlessly recompute). Fail-safe: undefined on opt-out or a
  // throwing signature — the frame then omits the ETag and the client keeps its
  // last stored one.
  //
  // ONLY sendUpdate may call this.
  async function pushEtag(
    entry: RegistryEntry,
    params: ResourceParams,
  ): Promise<string | undefined> {
    if (!entry.revalidate) return undefined;
    const revalidate = entry.revalidate;
    try {
      const run = () => revalidate(params);
      const raw = await (opts.wrapOrigin ? opts.wrapOrigin("push", entry.key, run) : run());
      return normalizeEtag(raw);
    // eslint-disable-next-line promise-safety/no-absorbed-failure -- the loader error IS reported (reportLoaderError); returning undefined skips this push so the live-state sub retains its last-good value (documented stale-safe behavior), never publishing a false empty
    } catch (err) {
      reportLoaderError(`revalidate failed for ${entry.key}`, err);
      return undefined;
    }
  }

  // Build and broadcast a value-carrying `update` frame — the ONLY caller of
  // `pushEtag`, so an ETag can ride ONLY this frame. An ETag may accompany a frame
  // only if that frame CARRIES the value the ETag describes, so the etag is
  // computed here, at the one site that broadcasts a value-carrying `update`, and
  // nowhere else. The `invalidate` frame and every `delta` frame therefore cannot
  // compute one: not by convention, but because there is no other call site.
  // (Before this, both drain paths hoisted `pushEtag` above the frame-kind branch
  // and the non-`update` branches silently discarded it — for `edited-files` that
  // was a DB read + 3 git spawns + an lstat per dirty file thrown away on every
  // watcher notify.)
  //
  // A resource that never opted into `revalidate` builds AND sends its frame with
  // NO await anywhere on this path — it must not pay a microtask yield before the
  // frame reaches the wire. `runtime-h5.test.ts` H5a pins that a push beats a
  // racing parked sub-ack, and one extra tick before the `ws.send` flips that
  // order. Only the etag path awaits, and its `.then` broadcast lands the frame on
  // the wire in the same continuation the etag resolves in. (An earlier version
  // built the frame in a plain `async` helper and returned it to the caller to
  // send; `await`ing that helper deferred EVERY push-mode send by a tick — almost
  // no resource declares `revalidate` — and broke H5a. Sending inside keeps the
  // no-await property structural.)
  //
  // Unlike the read path (handleSub / handleResourceHttp), the etag-AFTER-value
  // order is SAFE here and deliberately not reordered: this frame CARRIES the
  // value, and any change landing between the value read and this etag read fires
  // its own notify → flushAgain → another drainEntry that ships a fresh value +
  // etag, so a momentarily skewed frame is always superseded (self-healing). The
  // read path has no such self-heal and must keep its etag-BEFORE-value ordering.
  // `watermark` is the flight-co-produced commit watermark for THIS value (Rule
  // B′ — a full value-carrying frame may carry one; see `getResourceValue`).
  // Passed by value, so the no-`revalidate` path keeps its no-await-before-send
  // property (H5a) untouched.
  // `ackTx` is the flight-resolved mutation-ack attribution (feed-driven
  // recomputes only — the read paths never pass one). Passed by value like
  // `watermark`, so the no-`revalidate` path keeps its no-await-before-send
  // property (H5a) untouched.
  function sendUpdate(
    entry: RegistryEntry,
    params: ResourceParams,
    value: unknown,
    version: number,
    subs: SocketState[],
    watermark?: string,
    ackTx?: readonly string[],
  ): void | Promise<void> {
    const broadcast = (etag?: string): void => {
      const msg = {
        kind: "update" as const,
        key: entry.key,
        params,
        value,
        version,
        ...(etag !== undefined ? { etag } : {}),
        ...(watermark !== undefined ? { watermark } : {}),
        ...(ackTx !== undefined && ackTx.length > 0 ? { ackTx } : {}),
      };
      broadcastJson(subs, msg);
    };
    if (!entry.revalidate) {
      broadcast(); // sync send — no microtask before the wire (H5a)
      return;
    }
    return pushEtag(entry, params).then(broadcast);
  }

  // Coalesce an incoming notify into the pending map for one pk, applying the
  // FULL-absorbing union: a null `incoming` (or an existing FULL) sticks the pk
  // at FULL; otherwise the incoming ids union into the existing scoped set.
  //
  // `deleted` (M5 `scopedMembership` only) is the op-D channel. It rides ALONGSIDE
  // a scoped `incoming` and follows the same rules — FULL absorbs it, a degrade to
  // FULL drops it, scoped∪scoped unions it:
  //
  //   existing | incoming | deleted | result
  //   none     | null     |   —     | FULL (no deleted)
  //   none     | Set A    | Set D   | copy both
  //   FULL     | anything | anything| unchanged (absorbs; drops incoming deleted)
  //   scoped   | null     |   —     | degrade FULL, drop deleted
  //   scoped   | Set A    | Set D   | union both
  //
  // Omitting `deleted` (every legacy caller) is byte-identical to the pre-M5 merge.
  //
  // `sourceTx` (mutation-ack attribution) is unioned on EVERY branch — including
  // FULL absorb and the degrade-to-FULL — because a FULL recompute reads
  // post-commit, so the ackTx claim ("W's rows have been re-read") survives the
  // scope degrade. Contrast `deleted`, which FULL drops (a FULL recompute
  // resolves membership wholesale). Capped at SOURCE_TX_CAP: overflow suppresses
  // the whole set for the cycle (a missing ack is safe; a torn set is not).
  const SOURCE_TX_CAP = 64;
  function unionSourceTx(pending: PendingNotify, sourceTx?: ReadonlySet<string>): void {
    if (!sourceTx || sourceTx.size === 0 || pending.sourceTxOverflow) return;
    const set = (pending.sourceTx ??= new Set<string>());
    for (const id of sourceTx) set.add(id);
    if (set.size > SOURCE_TX_CAP) {
      pending.sourceTxOverflow = true;
      pending.sourceTx = undefined;
    }
  }
  function mergePending(
    map: Map<string, PendingNotify>,
    pk: string,
    params: ResourceParams,
    incoming: Set<string> | null,
    deleted?: Set<string>,
    sourceTx?: ReadonlySet<string>,
  ): void {
    const existing = map.get(pk);
    if (!existing) {
      // First merge: stamp the staleness-window start. Never overwritten below.
      const created: PendingNotify = {
        params,
        affected: incoming === null ? null : new Set(incoming),
        // A FULL first-merge carries no deleted set (FULL recomputes wholesale).
        ...(incoming !== null && deleted && deleted.size > 0
          ? { deleted: new Set(deleted) }
          : {}),
        enqueuedAt: performance.now(),
      };
      unionSourceTx(created, sourceTx);
      map.set(pk, created);
      return;
    }
    // FULL absorbs the scope but NOT the ack attribution — union first.
    unionSourceTx(existing, sourceTx);
    if (existing.affected === null) return; // FULL absorbs everything (incl. deleted)
    if (incoming === null) {
      existing.affected = null; // degrade to FULL
      existing.deleted = undefined; // FULL recomputes wholesale — drop op-D ids
      return;
    }
    for (const id of incoming) existing.affected.add(id);
    if (deleted && deleted.size > 0) {
      const d = (existing.deleted ??= new Set<string>());
      for (const id of deleted) d.add(id);
    }
  }

  // The pending's shippable ackTx: undefined when absent, empty, or overflowed
  // (suppression — see `PendingNotify.sourceTxOverflow`).
  function pendingAckTx(pending: PendingNotify): string[] | undefined {
    if (pending.sourceTxOverflow || !pending.sourceTx || pending.sourceTx.size === 0) {
      return undefined;
    }
    return [...pending.sourceTx];
  }

  // The pending's sourceTx as threaded DOWNSTREAM through the cascade (a
  // downstream recompute reads post-commit too, so the claim propagates).
  // Overflow propagates as suppression (undefined).
  function cascadeSourceTx(pending: PendingNotify): ReadonlySet<string> | undefined {
    return pending.sourceTxOverflow ? undefined : pending.sourceTx;
  }

  // Broadcast a standalone `{ kind: "ack" }` frame for a recompute that produced
  // NO value change — gated on the entry's `ackChannel` opt-in, a non-empty
  // (non-overflowed) sourceTx, and live subscribers. Version-less and
  // cache-less by design: it MUST NOT bump the per-pk version counter, touch
  // the snapshot, or cascade — it exists purely so an optimistic client's
  // exact-ack confirmation never hangs on a no-op recompute.
  function broadcastAckOnly(entry: RegistryEntry, pendingEntry: PendingNotify): void {
    if (!entry.ackChannel) return;
    const ackTx = pendingAckTx(pendingEntry);
    if (ackTx === undefined) return;
    const subs = subscribersFor(entry.key, paramsKey(pendingEntry.params));
    if (subs.length === 0) return;
    broadcastJson(subs, {
      kind: "ack" as const,
      key: entry.key,
      params: pendingEntry.params,
      ackTx,
    });
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
    // Membership (bounded `membership` or the M5 `scopedMembership` alias) is
    // only sound on a keyed OWN-IDENTITY resource — the membership diff
    // reconciles the loader's own row ids against the per-pk snapshot, and
    // INSERT/DELETE scope through the identity view. Requiring `identityTable`
    // also makes it incompatible with `recompute: { full }` (the ScopePolicy is
    // identityTable XOR recompute), so a FULL opt-out can never also claim
    // membership scoping. Fail loudly at registration.
    if (def.scopedMembership && def.membership) {
      throw new Error(
        `defineResource: "scopedMembership" and "membership" are mutually exclusive for key "${def.key}" — scopedMembership IS the unbounded-window membership alias`,
      );
    }
    const membershipField = def.membership
      ? "membership"
      : def.scopedMembership
        ? "scopedMembership"
        : null;
    if (membershipField) {
      if (mode !== "keyed") {
        throw new Error(
          `defineResource: ${membershipField} requires mode "keyed" for key "${def.key}"`,
        );
      }
      if (!def.identityTable) {
        throw new Error(
          `defineResource: ${membershipField} requires an identityTable (an own-identity scoped resource) for key "${def.key}"`,
        );
      }
    }
    // Normalize both public forms into the one internal record every consumer
    // branches on. The alias is the ONLY unbounded window (`bounded: false`) —
    // it keeps L2 persistence and the retain snapshot encoder; a declared
    // `membership` is bounded by contract (excluded from persistence, hashed).
    const membership: MembershipRecord | undefined = def.membership
      ? def.membership.kind === "window"
        ? {
            kind: "window",
            windowIdsOf: def.membership.windowIdsOf as (
              params: ResourceParams,
            ) => Promise<string[]>,
            bounded: true,
            orderSignatureOf: def.membership.orderSignatureOf,
          }
        : {
            kind: "point",
            idsOf: def.membership.idsOf as (params: ResourceParams) => readonly string[],
          }
      : def.scopedMembership
        ? {
            kind: "window",
            windowIdsOf: def.scopedMembership.orderOf as (
              params: ResourceParams,
            ) => Promise<string[]>,
            bounded: false,
          }
        : undefined;
    // The `authorize` seam is enforced on the WS subscribe path ONLY —
    // `handleResourceHttp` (and the client's sub-error → HTTP-refetch heal)
    // would serve the value without ever consulting it, a silent authorization
    // bypass. Refuse the declaration until HTTP parity exists, so the first
    // real consumer hits this wall instead of shipping the hole. Build parity
    // (one shared admission check across handleSub/handleSubBatch/
    // handleResourceHttp) before deleting this guard.
    if (def.authorize) {
      throw new Error(
        `defineResource: "authorize" is not enforced on the HTTP read path yet for key "${def.key}" — build handleResourceHttp parity before using this seam`,
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
          signature: dep.signature as
            | ((
                upstreamAffected: ReadonlySet<string>,
                upstreamParams: ResourceParams,
              ) => Promise<Map<string, string>> | Map<string, string>)
            | undefined,
          lastSignatures: new Map(),
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
      membership,
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
      revalidate: def.revalidate as
        | ((params: ResourceParams) => Promise<string>)
        | undefined,
      authorize: def.authorize as
        | ((params: ResourceParams) => boolean | Promise<boolean>)
        | undefined,
      ackChannel: def.ackChannel,
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
      bootCritical: def.bootCritical,
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
    contract: ResourceContract<T, P> & { keyed?: never },
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
  // Two shapes mirroring `defineResource`: the flat loose `ResourceDefinition`,
  // and the `(contract, serverOpts)` form that reads key/schema/keyed-ness AND
  // `bootCritical` off a shared client descriptor. External resources are NOT
  // held to the keyed `ScopePolicy` invariant (no DB feed to scope against), so
  // the two-arg overload takes plain `ServerResourceOptions`.
  function defineExternalResource<T, P extends ResourceParams = ResourceParams>(
    def: ResourceDefinition<T, P>,
  ): ExternalResource<T, P>;
  function defineExternalResource<T, P extends ResourceParams = ResourceParams>(
    contract: ResourceContract<T, P>,
    opts: ServerResourceOptions<T, P>,
  ): ExternalResource<T, P>;
  function defineExternalResource<T, P extends ResourceParams = ResourceParams>(
    a: ResourceDefinition<T, P> | ResourceContract<T, P>,
    opts?: ServerResourceOptions<T, P>,
  ): ExternalResource<T, P> {
    const def = opts
      ? contractToDefinition(a as ResourceContract<T, P>, opts)
      : (a as ResourceDefinition<T, P>);
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

  // Broadcast one frame to N subscribers: serialize ONCE, send the string to
  // each socket. The per-subscriber `sendJson` loop this replaces stringified
  // the identical frame N times — for a large value that multiplied the
  // delivery path's allocation churn by subscriber count (the ±60–70 MB/10 s
  // GC sawtooth; research/perfs/2026-07-16-main-paging-victim-investigation-PLAN.md
  // §B2). Synchronous end-to-end so the no-await-before-send property of the
  // push path (H5a) is untouched. Per-socket try/catch mirrors sendJson: a
  // dead socket's close handler cleans up, the rest still receive.
  function broadcastJson(subs: readonly SocketState[], obj: unknown): void {
    if (subs.length === 0) return;
    const str = JSON.stringify(obj);
    for (const s of subs) {
      try {
        s.ws.send(str);
      // eslint-disable-next-line promise-safety/no-bare-catch
      } catch {
        // close handler will clean up
      }
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
    opts?: {
      source?: "hand" | "feed" | "synthetic";
      deleted?: Set<string>;
      /** Source txid (feed only) — mutation-ack attribution. Hand/synthetic
       *  notifies never carry one, so their frames are structurally ack-less. */
      sourceTx?: string;
    },
  ): void {
    const pk = paramsKey(params);
    // Self-verification recorder (cascade is byte-identical regardless of source).
    const source = opts?.source ?? "hand";
    // A synthetic push (the debug churn emitter) drives the identical cascade but
    // is NOT a real change, so it must not touch the hand-vs-feed self-verification
    // counters or spam the read-set-gap warning at N/sec — skip the whole stats
    // block and fall straight through to the shared merge + flush-scheduling tail.
    if (source !== "synthetic") {
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
    }
    mergePending(
      entry.pendingNotifies,
      pk,
      params,
      affected,
      opts?.deleted,
      opts?.sourceTx !== undefined ? new Set([opts.sourceTx]) : undefined,
    );
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

  // A bounded-membership entry: a window with a bound (declared via the public
  // `membership` selector) or a point set. These are NEVER L2-persisted — their
  // value is a per-subscription bounded working set, not a whole-collection
  // materialization; persisting them would reintroduce the FULL-recompute-and-
  // persist-on-every-change churn the bounded contract exists to kill. Read
  // straight off the definition (generic — never by resource name). The legacy
  // `scopedMembership` alias (`bounded: false`) keeps persistence.
  function membershipBounded(entry: RegistryEntry): boolean {
    const m = entry.membership;
    if (!m) return false;
    return m.kind === "point" || m.bounded;
  }

  // The unbounded-window alias (`scopedMembership`) — the ONLY membership shape
  // whose persisted-reconstruction path exists, and therefore the only one that
  // retains snapshot bytes and keeps its snapshot across N→0 (when persisted).
  function isUnboundedWindow(entry: RegistryEntry): boolean {
    return entry.membership?.kind === "window" && !entry.membership.bounded;
  }

  // The snapshot entry representation for THIS resource, decided statically
  // from the definition so it can never flip between seeding and consumption:
  //
  // - `scopedMembership` (unbounded-window alias) entries retain the row's full
  //   canonical JSON — their persisted-incremental path
  //   (`drainMembershipScoped`) reconstructs the FULL value by `JSON.parse` of
  //   the stored entries, so the bytes must be there. (Keying this off
  //   `shouldPersist` instead would race the hook's registration: a snapshot
  //   seeded as hashes before the persist hooks are wired would crash the first
  //   incremental persist.)
  // - Every other keyed entry — including bounded `membership` entries, which
  //   are never persisted — retains a 64-bit content hash: same diff semantics
  //   (entries are only equality-compared), ~16 B/row instead of a value-sized
  //   string Map rebuilt on every recompute. Collision trade documented on
  //   `hashSnapEncoder`.
  function snapEncoderFor(entry: RegistryEntry): SnapEncoder {
    return isUnboundedWindow(entry) ? retainSnapEncoder : hashSnapEncoder;
  }

  // The order-signature fn of a window membership entry, or undefined (point,
  // the alias, non-membership, or a window that never declared one).
  function orderSignatureFnOf(
    entry: RegistryEntry,
  ): ((row: unknown) => string) | undefined {
    const m = entry.membership;
    return m?.kind === "window" ? m.orderSignatureOf : undefined;
  }

  // Compute one row's order signature, fail-safe: a throwing `orderSignatureOf`
  // is reported and yields undefined — callers treat "unknown" as MOVED, so a
  // broken signature costs one extra bounded `windowIdsOf` run, never a stale
  // wire order.
  function safeOrderSig(
    entry: RegistryEntry,
    sigFn: (row: unknown) => string,
    row: unknown,
  ): string | undefined {
    try {
      return sigFn(row);
    // eslint-disable-next-line promise-safety/no-absorbed-failure -- the error IS reported (reportLoaderError), and undefined is not an absorbable empty: it is the documented "unknown" sentinel the callers treat as MOVED — the fail-safe direction (re-derive the window), never a false "unchanged"
    } catch (err) {
      reportLoaderError(`orderSignatureOf failed for ${entry.key}`, err);
      return undefined;
    }
  }

  // REPLACE the per-member order-signature map for `pk` from a FULL row array.
  // Called wherever a keyed snapshot is seeded/replaced from a full value
  // (sub-ack seed, membership FULL rebuild), so the map's lifecycle is identical
  // to the snapshot's. No-op unless the entry declares `orderSignatureOf`. A row
  // whose signature could not be computed is stored WITHOUT one, so the next
  // refill treats it as moved — fail-safe.
  function reseedOrderSigs(entry: RegistryEntry, pk: string, value: unknown): void {
    const sigFn = orderSignatureFnOf(entry);
    if (!sigFn || !Array.isArray(value)) return;
    const keyOf = entry.keyOf!;
    const sigs = new Map<string, string>();
    for (const row of value as unknown[]) {
      const s = safeOrderSig(entry, sigFn, row);
      if (s !== undefined) sigs.set(keyOf(row), s);
    }
    (entry.orderSigs ??= new Map()).set(pk, sigs);
  }

  // Build the id→entry map for a keyed resource's array value. The identity is
  // computed over the row's canonical JSON string (including nested arrays like
  // an attempt's `conversations`). Shared by `diffKeyed` and `handleSub` so
  // both sides compute identity identically.
  function snapshotOf(entry: RegistryEntry, value: unknown): Map<string, SnapEntry> {
    const keyOf = entry.keyOf;
    if (!keyOf) {
      throw new Error(`[resources] keyed resource "${entry.key}" missing keyOf`);
    }
    if (!Array.isArray(value)) {
      throw new Error(
        `[resources] keyed resource "${entry.key}" loader must return an array`,
      );
    }
    return buildSnapshot(value, keyOf, snapEncoderFor(entry));
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
    const { diff, nextSnapshot } = diffKeyedFull(
      snapshots.get(pk),
      value,
      keyOf,
      snapEncoderFor(entry),
    );
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
    const { upserts, nextSnapshot } = diffKeyedScopedPure(
      snap,
      scopedRows,
      keyOf,
      snapEncoderFor(entry),
    );
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

  // Cascade this entry's change into its downstream edges. Shared by the legacy
  // per-pk path AND the M5 membership path (`drainMembershipScoped`) — both supply
  // an EFFECTIVE affected set: `null` forces a FULL downstream cascade (and clears
  // remembered edge signatures), a non-null Set flows through the per-edge
  // relevance-signature gate + `affectedMap`. `value`/`valueComputed` feed a
  // value-aware downstream `map`. Extracted verbatim from `drainEntry`'s original
  // inline loop so both callers route through one implementation.
  // `sourceTx` (the upstream pending's mutation-ack attribution, minus overflow)
  // threads into every downstream `mergePending`, because a downstream recompute
  // triggered by this cascade also reads post-commit — the ackTx claim holds
  // transitively. A `SKIP_EDGE` relevance skip drops it (vacuously irrelevant
  // downstream; a missing ack is safe).
  async function cascadeDownstream(
    entry: RegistryEntry,
    params: ResourceParams,
    affected: Set<string> | null,
    value: unknown,
    valueComputed: boolean,
    sourceTx?: ReadonlySet<string>,
  ): Promise<void> {
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
        // FULL cascade: propagate everything. Drop remembered signatures — the
        // new upstream values weren't observed here, so a stale entry could
        // wrongly skip the next scoped change back to a pre-FULL signature.
        edge.lastSignatures.clear();
        downAffected = null;
      } else if (!edge.affectedMap) {
        downAffected = null;
      } else {
        // The relevance gate (`signature`) and `affectedMap` both self-query the
        // DB to translate the changed upstream ids into downstream ids. Run that
        // translation under a `cascade` origin entry (server: recordEntrySpan;
        // central: identity) so those reads (a) route through the loader DB gate —
        // otherwise a large scoped fan-out issues ungated queries that contend
        // with interactive work past the reserved-interactive floor — and (b) are
        // attributed in the profiler as `cascade:<downstreamKey>` instead of
        // running unmeasured under the enclosing `flush`. These are edge
        // (ids-translation) reads, NOT the downstream's value dependencies, so
        // they are deliberately NOT captured into the loader read-set index: a
        // standalone change to a table only `affectedMap` reads never requires the
        // downstream to recompute (only the upstream cascade does, already
        // scoped), so indexing them would raise a false silent-FULL flag.
        const affectedMap = edge.affectedMap;
        const signature = edge.signature;
        // Relevance gate (Layer 2): keep only the upstream ids whose
        // downstream-relevant signature changed, so a scoped change that touched
        // only fields this downstream ignores (e.g. a conversation's
        // waitingFor/updatedAt vs the tasks/attempts aggregates) stops here
        // instead of forcing a recompute that diffs to empty. No signature on the
        // edge ⇒ every delivered id passes (prior behavior). Returns SKIP_EDGE
        // when nothing relevant changed (the closure cannot `continue` across the
        // wrapOrigin boundary).
        const translate = async (): Promise<Set<string> | null | typeof SKIP_EDGE> => {
          let relevant: ReadonlySet<string> = affected;
          if (signature) {
            try {
              const sigs = await signature(affected, params);
              const kept = new Set<string>();
              for (const id of affected) {
                const sig = sigs.get(id);
                if (sig === undefined || sig !== edge.lastSignatures.get(id)) {
                  kept.add(id);
                  if (sig !== undefined) edge.lastSignatures.set(id, sig);
                }
              }
              relevant = kept;
            } catch (err) {
              reportLoaderError(
                `signature failed (${entry.key} → ${edge.downstreamKey})`,
                err,
              );
              relevant = affected; // fail-safe: cascade everything
            }
          }
          if (relevant.size === 0) return SKIP_EDGE; // nothing relevant changed
          try {
            return new Set(await affectedMap(relevant, params));
          // eslint-disable-next-line promise-safety/no-absorbed-failure -- the error IS reported (reportLoaderError), and null is not an absorbable empty here: it is the documented "unscoped" sentinel that forces the downstream entry into a FULL recompute from source — the fail-safe direction (recompute everything), never a false "nothing changed"
          } catch (err) {
            reportLoaderError(
              `affectedMap failed (${entry.key} → ${edge.downstreamKey})`,
              err,
            );
            return null;
          }
        };
        const result = await (opts.wrapOrigin
          ? opts.wrapOrigin("cascade", edge.downstreamKey, translate)
          : translate());
        if (result === SKIP_EDGE) continue; // nothing relevant changed → skip edge
        downAffected = result;
      }
      for (const dp of derived) {
        mergePending(down.pendingNotifies, paramsKey(dp), dp, downAffected, undefined, sourceTx);
      }
    }
  }

  // Membership FULL path (drainEntry branches 2 & 3): a membership entry
  // (window / point / the M5 alias) that is either sticky-FULL (an id-less
  // contributor coalesced in) or has NO snapshot yet (first post-boot change,
  // eviction, a race). For a bounded window/point entry this "FULL" is bounded
  // by construction — the entry loader at these params IS the windowed/point
  // read, never an unbounded collection sweep. It FULL-recomputes
  // and — unlike the legacy keyed FULL path, which only touches the snapshot when
  // a subscriber is present — SEEDS/REPLACES the per-pk snapshot whenever the value
  // is computed (persisted or subscribed), so the next incremental membership diff
  // has a base. Cascades FULL. See research/2026-07-03-global-scoped-membership-m5.md.
  async function drainMembershipFull(
    entry: RegistryEntry,
    pendingEntry: PendingNotify,
    persisted: boolean,
  ): Promise<void> {
    const { params } = pendingEntry;
    const pk = paramsKey(params);
    const version = (entry.versions.get(pk) ?? 0) + 1;
    entry.versions.set(pk, version);
    const subs = subscribersFor(entry.key, pk);
    const hasValueAwareDownstream = entry.downstream.some((d) => d.map !== undefined);
    // The snapshot must be maintained whenever it could be needed later: a
    // persisted entry recomputes every change (and survives N→0), and a subscribed
    // entry needs a diff base. With neither (nor a value-aware downstream) there is
    // nothing to seed — matching the legacy `needValue` gate.
    const needValue = persisted || subs.length > 0 || hasValueAwareDownstream;

    let value: unknown;
    // The flight-co-produced commit watermark for the FULL value below (Rule B′
    // — this path's frames fully reconcile the client). Distinct from the L2
    // persist watermark: that one must floor the persisted row, this one rides
    // the wire with the value it describes.
    let flightWatermark: string | undefined;
    // Flight-resolved mutation-ack attribution: the pending's sourceTx SEEDS the
    // flight; a joined stale flight resolves the STARTER's (typically absent)
    // seed instead, so a pre-commit value is never stamped with this pending's
    // claim (missed ack safe, false ack structurally impossible).
    let flightAckTx: readonly string[] | undefined;
    let valueComputed = false;
    if (needValue) {
      let watermark: string | undefined;
      if (persisted && opts.captureWatermark) {
        try {
          watermark = await opts.captureWatermark();
        } catch (err) {
          reportLoaderError(`watermark capture failed for ${entry.key}`, err);
          watermark = undefined;
        }
      }
      const seedAckTx = pendingAckTx(pendingEntry);
      try {
        ({ value, watermark: flightWatermark, ackTx: flightAckTx } = await (opts.wrapOrigin
          ? opts.wrapOrigin("push", entry.key, () =>
              getResourceValue(entry, params, undefined, undefined, false, seedAckTx))
          : getResourceValue(entry, params, undefined, undefined, false, seedAckTx)));
        valueComputed = true;
      } catch (err) {
        reportLoaderError(`loader failed for ${entry.key}`, err);
        return; // never ship or cascade a torn read; snapshot untouched — and no ack (no false ack on failure)
      }
      if (persisted && watermark !== undefined && opts.persistSnapshot) {
        const tablesRead = persistReadSet(entry.key);
        try {
          await opts.persistSnapshot(entry.key, pk, value, watermark, tablesRead);
        } catch (err) {
          reportLoaderError(`snapshot persist failed for ${entry.key}`, err);
        }
      }
    }

    if (subs.length > 0 && valueComputed) {
      const hadSnapshot = entry.snapshots?.has(pk) ?? false;
      const { upserts, deletes, order } = diffKeyed(entry, pk, value); // seeds/replaces snapshot
      if (!hadSnapshot) {
        await sendUpdate(entry, params, value, version, subs, flightWatermark, flightAckTx);
        opts.onPush?.(entry.key, { subscribers: subs.length, changed: true });
      } else {
        // A FULL-recompute keyed delta fully reconciles the client, so it may
        // carry the flight watermark (Rule B′). Scoped deltas never do. The
        // flight-resolved ackTx rides too (a FULL read is post-commit).
        const msg = {
          kind: "delta" as const,
          key: entry.key,
          params,
          upserts,
          deletes,
          order,
          version,
          ...(flightWatermark !== undefined ? { watermark: flightWatermark } : {}),
          ...(flightAckTx !== undefined && flightAckTx.length > 0 ? { ackTx: flightAckTx } : {}),
        };
        broadcastJson(subs, msg);
        opts.onPush?.(entry.key, {
          subscribers: subs.length,
          changed: upserts.length > 0 || deletes.length > 0 || order !== undefined,
        });
      }
      opts.onDelivered?.(entry.key, performance.now() - pendingEntry.enqueuedAt, subs.length);
    } else if (valueComputed) {
      // Zero subscribers but a value was computed (persisted / value-aware
      // downstream): still seed/replace the snapshot so the next membership diff
      // has a base. This is the M5 difference from the legacy keyed FULL path.
      diffKeyed(entry, pk, value);
    }
    // The order-signature map's lifecycle mirrors the snapshot's: whenever the
    // FULL value replaced the snapshot above, reseed the sigs from it too.
    if (valueComputed) reseedOrderSigs(entry, pk, value);

    // A FULL recompute cascades FULL (clears edge signatures inside the helper).
    await cascadeDownstream(entry, params, null, value, valueComputed, cascadeSourceTx(pendingEntry));
  }

  // Membership incremental path (drainEntry branch 4): a membership entry
  // (window — bounded or the M5 alias — or point) with a scoped pending AND a
  // live snapshot. Refills only the requested ids (skipping the loader entirely
  // for a pure DELETE), derives the authoritative order per kind (see the
  // classification block below), reconciles membership via
  // `diffKeyedScopedMembership`, ships an incremental delta (with `order` iff
  // membership changed), and — for a persisted (alias) entry — reconstructs the
  // FULL value from the post-diff snapshot and persists it (byte-identical
  // jsonb to a FULL persist). Any loader/windowIdsOf failure falls back to the
  // FULL path so torn membership is never shipped — bounded for window/point
  // entries by construction, since their loader IS the windowed/point read.
  async function drainMembershipScoped(
    entry: RegistryEntry,
    pendingEntry: PendingNotify,
    persisted: boolean,
  ): Promise<void> {
    const membership = entry.membership!;
    const keyOf = entry.keyOf!;
    const { params } = pendingEntry;
    const pk = paramsKey(params);
    const requestedIds = pendingEntry.affected ?? new Set<string>();
    const deletedIds = pendingEntry.deleted ?? new Set<string>();
    // Nothing actually changed (an empty scoped set with no deletes) → skip
    // entirely: no version bump, no frame, no cascade. This is also the ACK-ONLY
    // pending a point empty-intersection routes here (the change's ids missed
    // this tuple's set, but the writer still deserves its ack) — an opted-in
    // `ackChannel` entry broadcasts the standalone ack frame, version-less.
    if (requestedIds.size === 0 && deletedIds.size === 0) {
      broadcastAckOnly(entry, pendingEntry);
      return;
    }

    const snapshots = (entry.snapshots ??= new Map());
    const prev = snapshots.get(pk)!; // caller only routes here when a snapshot exists

    // Persisted: capture the watermark BEFORE any read, so a write invisible to the
    // refill/orderOf snapshot has xid >= this floor and is replayed by catch-up.
    let watermark: string | undefined;
    if (persisted && opts.captureWatermark) {
      try {
        watermark = await opts.captureWatermark();
      } catch (err) {
        reportLoaderError(`watermark capture failed for ${entry.key}`, err);
        watermark = undefined;
      }
    }

    // Refill only the requested (op-I ∪ op-U) ids — a pure DELETE runs NO loader.
    let refillRows: unknown[] = [];
    let loaderRan = false;
    if (requestedIds.size > 0) {
      try {
        const ctx = { affectedIds: [...requestedIds] };
        const { value: v } = await (opts.wrapOrigin
          ? opts.wrapOrigin("push", entry.key, () => getResourceValue(entry, params, ctx))
          : getResourceValue(entry, params, ctx));
        if (!Array.isArray(v)) {
          throw new Error(`keyed resource "${entry.key}" loader must return an array`);
        }
        refillRows = v as unknown[];
        loaderRan = true;
      } catch (err) {
        reportLoaderError(`loader failed for ${entry.key}`, err);
        await drainMembershipFull(entry, pendingEntry, persisted); // never ship torn membership
        return;
      }
    }

    // Classify the membership impact of this flush against the prior snapshot:
    //   entered — a refilled id not already a member (a potential entrant; for a
    //             BOUNDED window only `windowIdsOf` can decide whether it truly
    //             enters — it may sort past the tail);
    //   exited  — a requested id the refill omitted (where-flip exit) or a
    //             deleted id that was a member (a leaver; for a bounded window a
    //             leaver frees a slot the new tail row must fill).
    // A pure in-place change (neither) runs NO ids query on ANY kind — the M5
    // cost model. Corollary: an in-place UPDATE never reorders the window until
    // the next membership delta, so a window's ORDER BY must be over
    // update-stable columns (createdAt/pk); the compiler layer documents and
    // owns that contract.
    const refillIds = new Set<string>();
    for (const row of refillRows) refillIds.add(keyOf(row));
    let entered = false;
    for (const id of refillIds) {
      if (!prev.has(id)) {
        entered = true;
        break;
      }
    }
    let exited = false;
    for (const id of requestedIds) {
      if (prev.has(id) && !refillIds.has(id)) {
        exited = true;
        break;
      }
    }
    if (!exited) {
      for (const id of deletedIds) {
        if (prev.has(id)) {
          exited = true;
          break;
        }
      }
    }
    // Order-signature seam: a refilled MEMBER row whose order-relevant
    // projection moved is membership-affecting for a window that declared
    // `orderSignatureOf` — its sort position may have changed, so the window is
    // re-derived (one bounded `windowIdsOf`) and the delta asserts the fresh
    // `order`. Unchanged-signature refills stay on the in-place path (no ids
    // query — the M5 cost model for content-only bumps). A missing stored
    // signature or a failed fresh one is treated as MOVED (fail-safe: one extra
    // bounded ids query, never a stale order). `freshSigs` records every
    // refilled row's signature (undefined = computation failed) for the
    // post-diff map maintenance below.
    const sigFn = orderSignatureFnOf(entry);
    const freshSigs = sigFn ? new Map<string, string | undefined>() : undefined;
    let orderMoved = false;
    if (sigFn && freshSigs) {
      const storedSigs = entry.orderSigs?.get(pk);
      for (const row of refillRows) {
        const id = keyOf(row);
        const fresh = safeOrderSig(entry, sigFn, row);
        freshSigs.set(id, fresh);
        if (!prev.has(id)) continue; // an entrant has no stored sig to compare
        if (fresh === undefined || fresh !== storedSigs?.get(id)) orderMoved = true;
      }
    }

    // Derive the authoritative order per membership kind. `orderedIds`, when
    // set, is the full member id list `diffKeyedScopedMembership` rebuilds the
    // snapshot and wire `order` from.
    let orderedIds: string[] | undefined;
    if (membership.kind === "point") {
      // Point set: membership is the params' explicit id set — no ids query
      // EVER. Entrants append to the prior order (point sets are unordered
      // bags); exits derive from the prior snapshot inside the diff.
      if (entered) {
        orderedIds = [...prev.keys()];
        for (const row of refillRows) {
          const id = keyOf(row);
          if (!prev.has(id)) orderedIds.push(id);
        }
      }
    } else if (membership.bounded) {
      // Bounded window: ANY potential membership change — an entrant candidate,
      // a leaver, OR a member whose order signature moved — re-derives the
      // window by running `windowIdsOf` (O(window), bounded; the v1
      // correctness-first choice — a tail-cursor comparison that skips
      // past-the-tail entrants without the ids query is a deferred
      // optimization). It is the entrant arbiter (an id absent from the
      // returned window did not enter; the diff drops it), the tail-pull source
      // (a leaver's freed slot names the new tail id here), and the fresh order
      // authority for a moved member.
      if (entered || exited || orderMoved) {
        try {
          orderedIds = await (opts.wrapOrigin
            ? opts.wrapOrigin("push", entry.key, () => membership.windowIdsOf(params))
            : membership.windowIdsOf(params));
        } catch (err) {
          reportLoaderError(`windowIdsOf failed for ${entry.key}`, err);
          await drainMembershipFull(entry, pendingEntry, persisted);
          return;
        }
        // Tail backfill: window ids whose row bytes neither the client base
        // (prev — the client holds those rows) nor this refill carries. Without
        // this, `diffKeyedScopedMembership`'s survivor filter would silently
        // drop the pulled-in tail row and the window would shrink. O(entrants).
        const missing = orderedIds.filter((id) => !prev.has(id) && !refillIds.has(id));
        if (missing.length > 0) {
          try {
            const ctx = { affectedIds: missing };
            const { value: v } = await (opts.wrapOrigin
              ? opts.wrapOrigin("push", entry.key, () => getResourceValue(entry, params, ctx))
              : getResourceValue(entry, params, ctx));
            if (!Array.isArray(v)) {
              throw new Error(`keyed resource "${entry.key}" loader must return an array`);
            }
            for (const row of v as unknown[]) {
              refillRows.push(row);
              refillIds.add(keyOf(row));
              // A backfilled row is a fresh read too — record its signature so
              // the post-diff map maintenance stores it alongside the refill's.
              if (sigFn && freshSigs) freshSigs.set(keyOf(row), safeOrderSig(entry, sigFn, row));
            }
            loaderRan = true;
          } catch (err) {
            reportLoaderError(`loader failed for ${entry.key}`, err);
            await drainMembershipFull(entry, pendingEntry, persisted);
            return;
          }
        }
      }
    } else {
      // Unbounded window (the `scopedMembership` alias) — byte-identical M5:
      // `windowIdsOf` (the orderOf query) runs ONLY when a row ENTERED (an
      // entrant needs authoritative placement); an exit-only change derives its
      // order from the prior snapshot inside the diff, so no query runs. No
      // backfill: an unbounded order lists no id outside prev ∪ refill (a
      // concurrent-insert straggler is dropped by the diff and healed by its
      // own feed event — the recorded M5 semantics).
      if (entered) {
        try {
          orderedIds = await (opts.wrapOrigin
            ? opts.wrapOrigin("push", entry.key, () => membership.windowIdsOf(params))
            : membership.windowIdsOf(params));
        } catch (err) {
          reportLoaderError(`orderOf failed for ${entry.key}`, err);
          await drainMembershipFull(entry, pendingEntry, persisted);
          return;
        }
      }
    }

    const { upserts, deletes, order, nextSnapshot } = diffKeyedScopedMembership(
      prev,
      refillRows,
      { requestedIds, deletedIds, orderedIds },
      keyOf,
      snapEncoderFor(entry),
    );
    snapshots.set(pk, nextSnapshot);

    // Maintain the order-signature map in lockstep with the snapshot: refilled
    // rows take their fresh signature, carried-over members keep the stored one,
    // ids that left the snapshot drop out. A refilled row whose fresh signature
    // failed is stored WITHOUT one, so the next refill treats it as moved.
    if (sigFn && freshSigs) {
      const storedSigs = entry.orderSigs?.get(pk);
      const nextSigs = new Map<string, string>();
      for (const id of nextSnapshot.keys()) {
        const s = freshSigs.has(id) ? freshSigs.get(id) : storedSigs?.get(id);
        if (s !== undefined) nextSigs.set(id, s);
      }
      (entry.orderSigs ??= new Map()).set(pk, nextSigs);
    }

    // Persisted: reconstruct the FULL value from the post-diff snapshot (ordered
    // id list + canonical-JSON entries) and persist it. `JSON.parse` of the
    // stored entry round-trips to the identical row object a FULL loader would
    // persist, so the jsonb is byte-identical to a FULL persist. This is the ONE
    // consumer that reads snapshot bytes back — `snapEncoderFor` guarantees a
    // scopedMembership entry's snapshot retains strings, and the guard makes a
    // future violation loud instead of a silent corrupt persist.
    if (persisted && watermark !== undefined && opts.persistSnapshot) {
      const full = [...nextSnapshot.values()].map((snap) => {
        if (typeof snap !== "string") {
          throw new Error(
            `[resources] scopedMembership entry "${entry.key}" holds a hashed snapshot — ` +
              "persist reconstruction needs canonical-JSON entries (snapEncoderFor invariant broken)",
          );
        }
        return JSON.parse(snap);
      });
      const tablesRead = persistReadSet(entry.key);
      try {
        await opts.persistSnapshot(entry.key, pk, full, watermark, tablesRead);
      } catch (err) {
        reportLoaderError(`snapshot persist failed for ${entry.key}`, err);
      }
    }

    // Ship the delta + bump the version only on a real change. `order` present
    // counts as a change on its own: the diff only returns it when the rebuilt
    // snapshot's membership/order actually differs from the prior one (e.g. a
    // member whose order signature moved past the tail leaves via `order` with
    // no surviving upsert and no `deletes` entry) — the client must receive the
    // frame or its array drifts from the mutated server snapshot.
    const changed = upserts.length > 0 || deletes.length > 0 || order !== undefined;
    const subs = subscribersFor(entry.key, pk);
    if (changed) {
      const version = (entry.versions.get(pk) ?? 0) + 1;
      entry.versions.set(pk, version);
      if (subs.length > 0) {
        // Membership-scoped deltas stamp the PENDING's sourceTx directly:
        // scoped/backfill refills are ctx loads, which never coalesce (they
        // bypass the read inflight), so no stale-flight adoption is needed —
        // and Rule B′ is untouched (still no watermark; ackTx claims only "the
        // listed transactions' rows were re-read", never snapshot completeness).
        const ackTx = pendingAckTx(pendingEntry);
        const msg = {
          kind: "delta" as const,
          key: entry.key,
          params,
          upserts,
          deletes,
          order,
          version,
          ...(ackTx !== undefined ? { ackTx } : {}),
        };
        broadcastJson(subs, msg);
        opts.onDelivered?.(entry.key, performance.now() - pendingEntry.enqueuedAt, subs.length);
      }
    } else {
      // Net-zero recompute (an entrant sorting past the tail, a window-boundary
      // skip): no frame, no version bump — but the writer's ack must not hang
      // on it. Opted-in entries broadcast the standalone ack frame.
      broadcastAckOnly(entry, pendingEntry);
    }
    // Mirror the legacy scoped path's accounting: an empty diff is a recorded
    // no-op push (changed:false) to any subscriber.
    if (subs.length > 0) {
      opts.onPush?.(entry.key, { subscribers: subs.length, changed });
    }

    // Downstream cascade: a DELETE forces FULL (a vanished row has no value for an
    // affectedMap to translate) and clears edge signatures; otherwise the requested
    // ids (incl. where-flip exits, whose rows still exist) flow through the gate.
    const cascadeAffected = deletedIds.size > 0 ? null : requestedIds;
    await cascadeDownstream(
      entry,
      params,
      cascadeAffected,
      refillRows,
      loaderRan,
      cascadeSourceTx(pendingEntry),
    );
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
    // L2: persisted entries (boot-critical, DB-backed) always recompute FULL and
    // persist their value to `live_state_snapshot` — even with zero subscribers —
    // so cold boot reads a fresh snapshot instead of a from-scratch rebuild. A
    // scoped partial is never persisted (§3.6/§6.7), and the value is never
    // persisted as a stale partial: the FULL recompute below ignores `affected`.
    // Gated on `!entry.externalSource` defensively (the injected `shouldPersist`
    // already excludes external sources, but a runtime check makes the invariant
    // hold regardless of how the hook is backed), and on `!membershipBounded` —
    // a bounded-membership entry (bounded window / point) is structurally
    // excluded from persistence, read off the definition (never by name): its
    // value is a per-subscription bounded working set, not a collection
    // materialization. See
    // research/2026-06-22-global-live-state-l2-persisted-materialization.md §3.3
    // and research/2026-07-18-global-bounded-working-set-resource-contract.md.
    const persisted =
      !entry.externalSource &&
      !membershipBounded(entry) &&
      (opts.shouldPersist?.(entry.key) ?? false);

    for (const pendingEntry of pending) {
      const { params, affected } = pendingEntry;
      const pk = paramsKey(params);
      // A membership entry (bounded window / point / the M5 alias) runs the
      // incremental membership path instead of the legacy scoped/FULL branches.
      // Branch 2/3 (FULL: sticky-FULL `affected === null`, or no snapshot yet)
      // vs branch 4 (incremental, snapshot present). For a window/point entry
      // the FULL branch is bounded by construction — its loader IS the
      // windowed/point read at these params. The legacy body below is
      // byte-identical for every non-membership entry — early-branch out so it
      // is never touched. See the M5 plan doc.
      if (entry.membership) {
        const hasSnapshot = entry.snapshots?.get(pk) !== undefined;
        if (affected === null || !hasSnapshot) {
          await drainMembershipFull(entry, pendingEntry, persisted);
        } else {
          await drainMembershipScoped(entry, pendingEntry, persisted);
        }
        continue;
      }
      // Scoped notify (Layer 2): `affected !== null` means recompute only those
      // row ids. An empty scoped set = nothing actually changed → skip the send
      // entirely (no version bump, no empty delta, no cascade). A persisted entry
      // is forced to FULL (it cannot persist a scoped partial), so the scoped
      // bookkeeping below only applies to the non-persisted path.
      const scoped = affected !== null && !persisted;
      if (affected !== null && affected.size === 0 && !persisted) continue;
      const version = (entry.versions.get(pk) ?? 0) + 1;
      entry.versions.set(pk, version);
      const subs = subscribersFor(entry.key, pk);

      // Compute value once if either a subscriber (push mode) or any
      // value-aware downstream `map` needs it. For invalidate-mode upstreams
      // we still compute when a map wants it — rare today, acceptable cost.
      // `affectedMap` self-queries the DB and must NOT force the value, else we
      // reintroduce the full upstream load Layer 2 is removing.
      // L2: a persisted entry ALWAYS needs the (FULL) value so it can be written
      // to the snapshot, even when no tab is subscribed.
      const hasValueAwareDownstream = entry.downstream.some((d) => d.map !== undefined);
      const needValue =
        persisted ||
        ((entry.mode === "push" || entry.mode === "keyed") && subs.length > 0) ||
        hasValueAwareDownstream;
      // L2: a persisted entry never passes a scoped ctx — it recomputes FULL.
      const ctx = scoped ? { affectedIds: [...affected!] } : undefined;
      let value: unknown;
      // Flight-co-produced commit watermark for a FULL value (Rule B′). A scoped
      // flight (ctx) always resolves it undefined, so the scoped delta below is
      // structurally tokenless.
      let flightWatermark: string | undefined;
      // Flight-resolved mutation-ack attribution: the pending's sourceTx seeds
      // the flight; a joined stale (pre-commit) flight resolves the STARTER's
      // seed instead — missed ack safe, false ack impossible. A ctx (scoped)
      // load returns the seed directly (ctx loads never coalesce).
      let flightAckTx: readonly string[] | undefined;
      const seedAckTx = pendingAckTx(pendingEntry);
      let valueComputed = false;
      if (needValue) {
        // L2: capture the durable position BEFORE the loader's first read, so any
        // write invisible to the loader's snapshot has xid >= this watermark and
        // is replayed by catch-up. program-order `await` makes it a true floor
        // across all of a multi-query loader's statements.
        let watermark: string | undefined;
        if (persisted && opts.captureWatermark) {
          try {
            watermark = await opts.captureWatermark();
          } catch (err) {
            // A failed watermark capture must not strand the value — skip the
            // persist this cycle (the snapshot keeps its prior, older floor) but
            // still serve subscribers. Loud via the report hook.
            reportLoaderError(`watermark capture failed for ${entry.key}`, err);
            watermark = undefined;
          }
        }
        try {
          // Origin = the push/cascade flush: re-establishes an entry context
          // (this runs in a bare microtask with no ambient context) so the
          // loader span attributes to this `push` instead of `parent: null`.
          ({ value, watermark: flightWatermark, ackTx: flightAckTx } = await (opts.wrapOrigin
            ? opts.wrapOrigin("push", entry.key, () =>
                getResourceValue(entry, params, ctx, undefined, false, seedAckTx))
            : getResourceValue(entry, params, ctx, undefined, false, seedAckTx)));
          valueComputed = true;
        } catch (err) {
          reportLoaderError(`loader failed for ${entry.key}`, err);
          // Skip sending and cascading on loader failure — otherwise we'd
          // invalidate downstream state based on a torn read. Never persist on
          // the failure path (the snapshot stays untouched). No ack either — a
          // failed recompute never proved anything was re-read.
          continue;
        }

        // L2: persist the FULL value on loader SUCCESS only. Requires a captured
        // watermark (skipped above on capture failure). Persist failure is
        // reported but does not block the send/cascade — the prior snapshot row
        // simply stays current.
        if (persisted && watermark !== undefined && opts.persistSnapshot) {
          // The loader has already run (via `getResourceValue` above), so its
          // per-run read-set is captured — `persistReadSet` returns the tables THIS
          // run read (replace, self-healing), persisted alongside the value so the
          // next cold boot routes catch-up by the current set without a loader run.
          const tablesRead = persistReadSet(entry.key);
          try {
            await opts.persistSnapshot(entry.key, pk, value, watermark, tablesRead);
          } catch (err) {
            reportLoaderError(`snapshot persist failed for ${entry.key}`, err);
          }
        }
      }

      if (subs.length > 0) {
        if (entry.mode === "invalidate") {
          const msg = { kind: "invalidate" as const, key: entry.key, params, version };
          broadcastJson(subs, msg);
        } else if (entry.mode === "keyed") {
          // `value` is guaranteed computed (needValue is true for keyed + subs).
          const hadSnapshot = entry.snapshots?.has(pk) ?? false;
          if (scoped && !hadSnapshot) {
            // Near-unreachable: a subscribed pk always seeded a snapshot at
            // sub-ack. If we somehow get here, the scoped `value` is partial and
            // unsafe for diffKeyed — reload the FULL value and diff that.
            let full: unknown;
            try {
              ({ value: full, watermark: flightWatermark, ackTx: flightAckTx } = await (opts.wrapOrigin
                ? opts.wrapOrigin("push", entry.key, () =>
                    getResourceValue(entry, params, undefined, undefined, false, seedAckTx))
                : getResourceValue(entry, params, undefined, undefined, false, seedAckTx)));
            } catch (err) {
              reportLoaderError(`loader failed for ${entry.key}`, err);
              continue;
            }
            // hadSnapshot was false ⇒ ship a full update base. diffKeyed here
            // serves only to (re)seed the snapshot from the full value.
            diffKeyed(entry, pk, full);
            await sendUpdate(entry, params, full, version, subs, flightWatermark, flightAckTx);
            opts.onPush?.(entry.key, { subscribers: subs.length, changed: true });
          } else if (scoped) {
            // Scoped path: merge the partial recompute into the snapshot and
            // ship only the changed rows. `deletes:[]`, `order:undefined` —
            // a scoped notify never asserts membership/order (those stay FULL).
            // The delta stamps the PENDING's sourceTx directly: a ctx load
            // never coalesces, so no stale-flight adoption is needed — and Rule
            // B′ is untouched (still watermark-less; ackTx claims only that the
            // listed transactions' rows were re-read, nothing about membership
            // or snapshot completeness).
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
                ...(seedAckTx !== undefined ? { ackTx: seedAckTx } : {}),
              };
              broadcastJson(subs, msg);
            } else {
              // Empty scoped diff: the recompute proved the bytes unchanged —
              // no value frame, but an opted-in entry still delivers the
              // writer's ack (a no-byte-change write must not hang it).
              broadcastAckOnly(entry, pendingEntry);
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
              await sendUpdate(entry, params, value, version, subs, flightWatermark, flightAckTx);
              opts.onPush?.(entry.key, { subscribers: subs.length, changed: true });
            } else {
              // A FULL-recompute keyed delta fully reconciles the client, so it
              // may carry the flight watermark (Rule B′) and the flight-resolved
              // ackTx. The scoped delta branch above stamps the pending's set.
              const msg = {
                kind: "delta" as const,
                key: entry.key,
                params,
                upserts,
                deletes,
                order,
                version,
                ...(flightWatermark !== undefined ? { watermark: flightWatermark } : {}),
                ...(flightAckTx !== undefined && flightAckTx.length > 0
                  ? { ackTx: flightAckTx }
                  : {}),
              };
              broadcastJson(subs, msg);
              opts.onPush?.(entry.key, {
                subscribers: subs.length,
                changed: upserts.length > 0 || deletes.length > 0 || order !== undefined,
              });
            }
          }
        } else {
          await sendUpdate(entry, params, value, version, subs, flightWatermark, flightAckTx);
        }
      }

      // Delivery latency (enqueue → ws.send) charged to this resource under the
      // active `flush` entry (server: recordSpan("push", `deliver:<key>`)). Only
      // when a subscriber actually received a frame. Identity no-op on central.
      if (subs.length > 0) {
        opts.onDelivered?.(entry.key, performance.now() - pendingEntry.enqueuedAt, subs.length);
      }

      await cascadeDownstream(
        entry,
        params,
        affected,
        value,
        valueComputed,
        cascadeSourceTx(pendingEntry),
      );
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
        // Client's last-known conditional-revalidation ETag for (key, params), if
        // it holds a cached value. Present only on `op: "sub"` from a client that
        // has one; an old client omits it → full-loader path (backward-compatible).
        etag?: string;
        // Version short-circuit echo: the client's last-applied version counter
        // plus the boot epoch it belongs to (see `handleSub`). Optional — an old
        // client omits them → full path.
        version?: number;
        epoch?: string;
        // The sending tab's id (per-tab sub bookkeeping — see `SocketSubRecord`).
        // Optional; an untagged frame lands in the legacy `""` bucket.
        tabId?: string;
        // `op: "sub-batch"` fields: one whole-set replay for ONE tab. `complete:
        // true` additionally reconciles — releases every sub that tab previously
        // held on this socket and did not restate.
        complete?: boolean;
        entries?: Array<{
          id?: number;
          key?: string;
          params?: ResourceParams;
          etag?: string;
          version?: number;
        }>;
      };
      if (m.kind === "pong") return;
      if (m.op === "sub") {
        void handleSub(state, m);
        return;
      }
      if (m.op === "sub-batch") {
        handleSubBatch(state, m);
        return;
      }
      if (m.op === "unsub") {
        handleUnsub(state, m);
        return;
      }
      if (m.op === "unsub-tab") {
        // Best-effort tab departure (pagehide): release everything this tab holds
        // on this socket. Subs other tabs still hold are untouched.
        releaseTabSubs(state, typeof m.tabId === "string" ? m.tabId : "");
        return;
      }
    },
    close(ws) {
      const timer = heartbeats.get(ws);
      if (timer) clearInterval(timer);
      heartbeats.delete(ws);
      const state = sockets.get(ws);
      if (state) {
        // Release once per (key, pk) regardless of how many tabs held it — the
        // socket-level refcount was bumped once per pk. Legacy `""`-bucket subs
        // release here too (their only teardown path).
        for (const [key, inner] of state.subs) {
          for (const [pk, rec] of inner) releaseSubRefcount(key, pk, rec.params);
        }
      }
      sockets.delete(ws);
    },
  };

  // Socket-level sub registration bookkeeping, shared by `handleSub` and
  // `handleSubBatch`. Fully synchronous: creates/updates the per-socket
  // `SocketSubRecord` (tagging the holding tab), and bumps `entry.subCounts` only
  // on the socket-level 0→1 (pk record created). Returns whether this
  // registration was the GLOBAL 0→1 transition — the caller then owes the
  // (possibly async) `onFirstSubscribe` exactly once.
  function registerSubOnSocket(
    state: SocketState,
    entry: RegistryEntry,
    pk: string,
    params: ResourceParams,
    tabId: string,
  ): { firstGlobal: boolean } {
    let inner = state.subs.get(entry.key);
    if (!inner) {
      inner = new Map();
      state.subs.set(entry.key, inner);
    }
    let rec = inner.get(pk);
    const alreadyHeldBySocket = rec !== undefined;
    if (!rec) {
      rec = { params, tabs: new Set<string>() };
      inner.set(pk, rec);
    }
    rec.tabs.add(tabId);
    if (alreadyHeldBySocket) return { firstGlobal: false };
    const prev = entry.subCounts.get(pk) ?? 0;
    entry.subCounts.set(pk, prev + 1);
    return { firstGlobal: prev === 0 };
  }

  async function handleSub(
    state: SocketState,
    m: {
      id?: number;
      key?: string;
      params?: ResourceParams;
      etag?: string;
      version?: number;
      epoch?: string;
      tabId?: string;
    },
  ): Promise<void> {
    const { id, key, params = {}, etag: clientEtag } = m;
    if (!key) return;
    const entry = registry.get(key);
    if (!entry) {
      sendJson(state.ws, { kind: "sub-error", id, key, params, reason: "unknown-key" });
      return;
    }
    // Subscription-authorization seam (deferred; single-instance-per-user — see
    // research/2026-07-02-global-adr-single-instance-per-user.md). Runs before
    // any side effect (refcount bump, onFirstSubscribe, loader read) so a refused
    // sub leaves no trace. No resource declares `authorize` today — the sole
    // trusted caller of the one-instance-per-user model is always allowed — so
    // for every shipped resource this branch is skipped entirely. A throwing
    // authorize fails CLOSED (report + reject) rather than leaking the value.
    if (entry.authorize) {
      let allowed: boolean;
      try {
        allowed = await entry.authorize(params);
      } catch (err) {
        reportLoaderError(`authorize failed for ${key}`, err);
        allowed = false;
      }
      if (!allowed) {
        sendJson(state.ws, { kind: "sub-error", id, key, params, reason: "unauthorized" });
        return;
      }
    }
    const pk = paramsKey(params);
    const { firstGlobal } = registerSubOnSocket(
      state,
      entry,
      pk,
      params,
      typeof m.tabId === "string" ? m.tabId : "",
    );
    if (firstGlobal && entry.onFirstSubscribe) {
      try {
        await entry.onFirstSubscribe(params);
      } catch (err) {
        reportLoaderError(`onFirstSubscribe failed for ${key}`, err);
      }
    }

    // Version short-circuit: the client echoed the (epoch, version) its cached
    // value was produced under. If the epoch is THIS boot and the version equals
    // the current per-pk counter, nothing changed since that value shipped — for
    // a non-revalidate resource the version counter is its complete change
    // signal (every state change routes through flushNotifies, which bumps it).
    // Answer `up-to-date` from memory: ZERO loader runs, ZERO read-admission
    // slots — the cure for the chronic full-set replay storms (each replayed
    // push-mode sub used to run the FULL loader behind the 6-slot gate; see
    // research/perfs/2026-07-11-compressor-thrash-subscription-replay-storm.md
    // Findings 2–3). Fully synchronous by construction. Restricted to:
    //   - same boot epoch — `entry.versions` is per-boot in-memory state, so a
    //     cross-boot version echo is incomparable (post-restart replays take the
    //     full path and re-baseline);
    //   - non-`revalidate` resources — a revalidatable resource's freshness
    //     authority is its ETag signature (probed below), not the version
    //     counter (its truth may live outside the notify stream, e.g. git).
    // The HTTP path (`handleResourceHttp`) deliberately has NO version
    // short-circuit: the invalidate-mode refetch must return a body at an equal
    // version (the client's strict-`<` HTTP guard accepts it). That HTTP body
    // carries `epoch: bootEpoch` alongside the version, so the client can tell a
    // fresh same-boot body apart from a stale-boot cache — the epoch-aware guard
    // that fixes the cross-boot cache-poisoning drop (Fix B).
    const currentVersion = entry.versions.get(pk) ?? 0;
    if (
      !entry.revalidate &&
      m.epoch === bootEpoch &&
      typeof m.version === "number" &&
      m.version === currentVersion
    ) {
      sendJson(state.ws, {
        kind: "up-to-date",
        id,
        key,
        params,
        version: currentVersion,
        epoch: bootEpoch,
      });
      recordSubShortCircuit(key);
      return;
    }

    await serveSub(state, entry, id, key, params, pk, clientEtag);
  }

  // The read/serve tail of a subscription: probe the conditional-revalidation
  // signature, run the gated full load, seed the keyed snapshot, and send the
  // sub-ack. Shared by `handleSub` and `handleSubBatch`'s full-path entries.
  // Callers have already registered the sub and settled `onFirstSubscribe`.
  async function serveSub(
    state: SocketState,
    entry: RegistryEntry,
    id: number | undefined,
    key: string,
    params: ResourceParams,
    pk: string,
    clientEtag: string | undefined,
  ): Promise<void> {
    // Report the CURRENT version without bumping: a sub-ack (or an `up-to-date`)
    // delivers existing state, it is not a state change. Bumping here made the
    // version climb on every (re)subscribe, which broke the missed-update
    // watchdog — the probe re-subscribes every sub, so the version always
    // appeared to advance even when nothing was missed. Mirrors
    // handleResourceHttp (also unbumped). The version advances only in
    // flushNotifies. A never-notified pk reports 0; the client's -1 "nothing
    // applied yet" baseline still accepts that sub-ack. Read up front because
    // both the `up-to-date` short-circuit and the loader-path sub-ack report it.
    const version = entry.versions.get(pk) ?? 0;

    // Conditional revalidation (ETag / 304 semantics): if this resource declares
    // a cheap signature, answer "is what you already have still current?" without
    // running the full loader when the client's last-known ETag matches. A backend
    // restart does not reload the page, so the client's cache still holds the last
    // value — on a match we send an `up-to-date` frame (the WS analogue of HTTP
    // 304) and the client keeps that cached value, adopting `version` so a later
    // real update isn't stale-dropped. This is the herd cure: a resubscribe for an
    // unchanged resource costs one cheap signature, not a full loader.
    //
    // THE INVARIANT: the ETag and the value must be produced by the SAME FLIGHT
    // over the same snapshot. An ETag may describe a snapshot OLDER than the value
    // it accompanies (costing one needless recompute on the next revalidation); it
    // must NEVER describe a newer one — that serves the stale value forever, since
    // the client's next revalidation matches the ETag, is answered
    // `up-to-date`/`304`, and an `invalidate`-mode push carries no value to heal it.
    //
    // Two mechanisms would break it, and both are closed here:
    //
    // 1. ORDERING. Computed AFTER the value, a change landing in between would ship
    //    a stale value stamped with an already-current ETag. So `computeEtag` runs
    //    FIRST, and any post-value change advances the ETag, forcing a real refetch.
    //    Still load-bearing — do not reorder.
    //
    // 2. COALESCING. Ordering alone is only sufficient if reading the value at time
    //    T yields the state at T. It does not when the flight COALESCES: two
    //    `handleSub`s that probed their own signatures either side of a change share
    //    one loader run, so the joiner holds the starter's older value while its own
    //    `freshEtag` names the newer state. So `freshEtag` is passed to `gatedRead`
    //    as a SEED and the flight hands back the etag it was actually seeded with
    //    (see `getResourceValue`). We stamp THAT — never `freshEtag` directly.
    //
    // `freshEtag` remains the right operand for the `up-to-date` short-circuit
    // below: that comparison is against THIS subscriber's `clientEtag` and asks
    // only "is your cached snapshot still current?", which no flight participates
    // in. `computeEtag` is fail-safe — undefined when the resource never opted in
    // OR the signature threw — so a broken signature degrades to the plain
    // full-loader path and never serves stale.
    const freshEtag = entry.revalidate ? await computeEtag(entry, params) : undefined;
    if (freshEtag !== undefined && clientEtag != null && freshEtag === clientEtag) {
      sendJson(state.ws, { kind: "up-to-date", id, key, params, version, epoch: bootEpoch });
      return;
    }

    let value: unknown;
    let etag: string | undefined;
    let watermark: string | undefined;
    try {
      // Origin = the subscription: establishes an entry context so the loader
      // span (and any gate waits it charges) is attributed to this `sub` request
      // instead of running with `parent: null`. Gated by the read-admission cap.
      ({ value, etag, watermark } = await gatedRead(entry, params, freshEtag));
    } catch (err) {
      reportLoaderError(`loader failed for ${key}`, err);
      sendJson(state.ws, { kind: "sub-error", id, key, params, reason: "loader-failed" });
      return;
    }
    // Yield ONCE before touching the snapshot or the wire. A push continuation
    // parked on the SAME coalesced flight attached after this read, so it
    // resumes one job later; it must still run first — it sends its update
    // frame synchronously (H5a: a push beats a racing parked sub-ack) and, for
    // keyed mode, performs the first diffKeyed (no snapshot yet → FULL update)
    // before this sub-ack's idempotent re-seed below (H5c). Before
    // gate-after-dedup the starter paid these hops implicitly in the
    // read-admission slot release chain; with the gate now inside the
    // single-flight, the yield is the explicit, pinned equivalent.
    await Promise.resolve();
    // Keyed entries: seed the per-pk snapshot from the full sub-ack value so the
    // next notify can diff against it. The sub-ack itself stays full-value.
    if (entry.mode === "keyed") {
      (entry.snapshots ??= new Map()).set(pk, snapshotOf(entry, value));
      reseedOrderSigs(entry, pk, value); // lifecycle mirrors the snapshot seed
    }
    // Stamp the etag the FLIGHT carried, not `freshEtag`. Three cases:
    //   - we started the flight  → `etag === freshEtag` (the common path).
    //   - we joined a read flight → the starter's older seed. Safe direction.
    //   - we joined a flight started by a push-path caller (no seed) → undefined
    //     → OMIT the etag entirely. The client then stores no etag for this value
    //     and its next revalidation does a full load. Falling back to `freshEtag`
    //     here would stamp a signature strictly newer than the value we are
    //     shipping — precisely the skew this whole comment exists to prevent.
    // Absent for non-opted-in resources → the frame is byte-identical to before.
    // `epoch` (this boot's identity) rides every sub-ack so the client can echo
    // its version on the next replay and be short-circuited (see `handleSub`).
    // `watermark` is the flight-co-produced commit watermark (Rule B′): like the
    // etag, we stamp the FLIGHT's, never our own probe's — a joiner adopts the
    // starter's floor, so the watermark can never be newer than the value.
    // `up-to-date` frames deliberately carry none (they ship no value).
    sendJson(state.ws, {
      kind: "sub-ack",
      id,
      key,
      params,
      value,
      version,
      ...(etag !== undefined ? { etag } : {}),
      ...(watermark !== undefined ? { watermark } : {}),
      epoch: bootEpoch,
    });
  }

  // Whole-set replay for ONE tab (`op: "sub-batch"`). Registration is fully
  // synchronous and happens FIRST — before the `complete: true` reconciliation
  // below — so an identical replay never transits a sub 1→0→1: no lifecycle-hook
  // churn, no keyed-snapshot eviction. Then each entry either short-circuits
  // (same-boot epoch + matching version → collected into ONE `up-to-date-batch`
  // frame, zero loader runs) or serves the full path exactly like a single sub.
  // The whole function is synchronous; all async work (onFirstSubscribe, the
  // gated loads) is detached per entry, mirroring the `void handleSub(...)`
  // dispatch of single subs.
  function handleSubBatch(
    state: SocketState,
    m: {
      tabId?: string;
      epoch?: string;
      complete?: boolean;
      entries?: Array<{
        id?: number;
        key?: string;
        params?: ResourceParams;
        etag?: string;
        version?: number;
      }>;
    },
  ): void {
    const tabId = typeof m.tabId === "string" ? m.tabId : "";
    const entries = Array.isArray(m.entries) ? m.entries : [];

    // Pass 1 — synchronous registration of every entry.
    const prepared: Array<{
      entry: RegistryEntry;
      id?: number;
      key: string;
      params: ResourceParams;
      pk: string;
      etag?: string;
      version?: number;
      firstGlobal: boolean;
    }> = [];
    // Keys retained by the reconciliation, including entries routed through the
    // full per-sub path (authorize) whose registration is deferred — dropping
    // them here would 1→0→1 them before their own handleSub registers.
    const retained = new Set<string>();
    for (const e of entries) {
      if (!e.key) continue;
      const params = e.params ?? {};
      const pk = paramsKey(params);
      retained.add(`${e.key}\0${pk}`);
      const entry = registry.get(e.key);
      if (!entry) {
        sendJson(state.ws, { kind: "sub-error", id: e.id, key: e.key, params, reason: "unknown-key" });
        continue;
      }
      if (entry.authorize) {
        // The authorization seam must run BEFORE any side effect (see
        // `handleSub`), so an authorized entry cannot be pre-registered here —
        // route it through the full per-sub path wholesale. (No shipped resource
        // declares `authorize` today.)
        void handleSub(state, {
          id: e.id,
          key: e.key,
          params,
          etag: e.etag,
          version: e.version,
          epoch: m.epoch,
          tabId,
        });
        continue;
      }
      const { firstGlobal } = registerSubOnSocket(state, entry, pk, params, tabId);
      prepared.push({
        entry,
        id: e.id,
        key: e.key,
        params,
        pk,
        etag: e.etag,
        version: e.version,
        firstGlobal,
      });
    }

    // `complete: true` reconciliation — this batch is the tab's WHOLE sub set,
    // so release every (key, pk) the tab previously held on this socket and did
    // not restate. Runs strictly AFTER registration (see the function comment).
    if (m.complete === true) {
      releaseTabSubs(state, tabId, retained);
    }

    // Pass 2 — synchronous short-circuit collection; everything else detaches
    // onto the full serve path.
    const upToDate: Array<{
      id?: number;
      key: string;
      params: ResourceParams;
      version: number;
    }> = [];
    for (const p of prepared) {
      const version = p.entry.versions.get(p.pk) ?? 0;
      if (
        !p.entry.revalidate &&
        m.epoch === bootEpoch &&
        typeof p.version === "number" &&
        p.version === version
      ) {
        // Same short-circuit as `handleSub`, collected into one batch frame. A
        // 0→1 entry still owes its lifecycle hook — fired detached so the batch
        // answer stays one synchronous frame (the socket is already registered,
        // so any change the hook's work triggers pushes to it normally).
        recordSubShortCircuit(p.key);
        upToDate.push({ id: p.id, key: p.key, params: p.params, version });
        if (p.firstGlobal && p.entry.onFirstSubscribe) {
          const hook = p.entry.onFirstSubscribe;
          void (async () => {
            try {
              await hook(p.params);
            } catch (err) {
              reportLoaderError(`onFirstSubscribe failed for ${p.key}`, err);
            }
          })();
        }
        continue;
      }
      void (async () => {
        // Mirror handleSub's ordering: settle the 0→1 hook before the read.
        if (p.firstGlobal && p.entry.onFirstSubscribe) {
          try {
            await p.entry.onFirstSubscribe(p.params);
          } catch (err) {
            reportLoaderError(`onFirstSubscribe failed for ${p.key}`, err);
          }
        }
        await serveSub(state, p.entry, p.id, p.key, p.params, p.pk, p.etag);
      })();
    }
    if (upToDate.length > 0) {
      sendJson(state.ws, { kind: "up-to-date-batch", epoch: bootEpoch, entries: upToDate });
    }
  }

  function handleUnsub(
    state: SocketState,
    m: { key?: string; params?: ResourceParams; tabId?: string },
  ): void {
    const { key, params = {} } = m;
    if (!key) return;
    const inner = state.subs.get(key);
    if (!inner) return;
    const pk = paramsKey(params);
    const rec = inner.get(pk);
    if (!rec) return;
    // Remove only the FRAME's tab (legacy untagged → the `""` bucket); the
    // socket-level refcount releases only when the last holding tab is gone.
    const tabId = typeof m.tabId === "string" ? m.tabId : "";
    if (!rec.tabs.delete(tabId)) return;
    if (rec.tabs.size > 0) return;
    inner.delete(pk);
    if (inner.size === 0) state.subs.delete(key);
    releaseSubRefcount(key, pk, rec.params);
  }

  // Release every sub `tabId` holds on this socket, except (key,pk)s named in
  // `retain`. Backs both `op: "unsub-tab"` (no retain set — full departure) and
  // the `sub-batch complete: true` reconciliation. A pk still held by another
  // tab keeps the socket-level refcount; only a last-holder removal releases.
  function releaseTabSubs(
    state: SocketState,
    tabId: string,
    retain?: ReadonlySet<string>,
  ): void {
    for (const [key, inner] of state.subs) {
      for (const [pk, rec] of inner) {
        if (retain?.has(`${key}\0${pk}`)) continue;
        if (!rec.tabs.delete(tabId)) continue;
        if (rec.tabs.size > 0) continue;
        inner.delete(pk);
        releaseSubRefcount(key, pk, rec.params);
      }
      if (inner.size === 0) state.subs.delete(key);
    }
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
      // M5 exception: a PERSISTED `scopedMembership` (unbounded-window alias)
      // entry recomputes on every change regardless of subscribers and
      // reconstructs its persisted value FROM the snapshot — so it must survive
      // N→0, or the next change would degrade to a needless FULL. Bounded to
      // opted-in persisted resources; bounded-membership entries (never
      // persisted) evict like any other keyed entry and self-heal via the
      // bounded FULL branch on the next change.
      const keepSnapshot =
        isUnboundedWindow(entry) &&
        !entry.externalSource &&
        (opts.shouldPersist?.(entry.key) ?? false);
      if (!keepSnapshot) {
        entry.snapshots?.delete(pk);
        entry.orderSigs?.delete(pk); // lifecycle mirrors the snapshot eviction
      }
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

  /**
   * GET /api/resources/:key?foo=bar — returns {value, version}.
   *
   * Conditional GET: for a resource that declares `revalidate`, an incoming
   * `If-None-Match` header is compared against the cheap signature. A match
   * returns `304 Not Modified` (empty body) so the client keeps its cached
   * value; otherwise the value is returned with a fresh `ETag` response header
   * the client stores for its next request. This is the standard-transport path
   * that invalidate-mode revalidatable resources (e.g. edited-files) use, since
   * their value already arrives via this HTTP fallback rather than a WS push.
   * Behavior is byte-identical to before for a resource without `revalidate` or a
   * request without `If-None-Match`.
   */
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

    // Conditional revalidation: compute the signature ONCE, BEFORE the value, and
    // use it for the If-None-Match/304 short-circuit — a match means the caller's
    // cached snapshot is still current, so 304 with no body and no loader run.
    // `computeEtag` is fail-safe (undefined on opt-out or a throwing signature), so
    // a broken signature falls through to the full value below and stamps no ETag.
    const ifNoneMatch = req.headers.get("If-None-Match");
    const freshEtag = entry.revalidate ? await computeEtag(entry, resourceParams) : undefined;
    if (freshEtag !== undefined && ifNoneMatch != null && freshEtag === ifNoneMatch) {
      // `no-store` even on the 304: the handler that emits the ETag (the header that
      // invites caching) owns forbidding the browser HTTP cache from storing the
      // revalidated body. Without it a restart-stable ETag lets the browser 304
      // onto a stale old-boot body it hands JS transparently — the cache-poisoning
      // wedge. See research/2026-07-15-global-live-state-http-cache-poisoning-class-fix.md.
      return new Response(null, { status: 304, headers: { "cache-control": "no-store" } });
    }

    let value: unknown;
    let etag: string | undefined;
    let watermark: string | undefined;
    try {
      // Same-flight co-production, exactly as `handleSub` (read its comment for the
      // full argument): `freshEtag` SEEDS the flight; the flight hands back the etag
      // it was actually seeded with, which is the caller's own only if this call
      // started it. A joiner adopts the starter's older seed, or `undefined` when a
      // push-path caller started the flight.
      ({ value, etag, watermark } = await gatedRead(entry, resourceParams, freshEtag));
    } catch (err) {
      reportLoaderError(`loader failed for ${key}`, err);
      return new Response("Loader failed", { status: 500 });
    }
    const pk = paramsKey(resourceParams);
    const version = entry.versions.get(pk) ?? 0;
    // `no-store` forbids the browser HTTP cache from storing this body — the
    // structural cure for the cache-poisoning wedge (a restart-stable ETag let the
    // browser 304-replay an old-boot body). See the 304 branch above and Fix A/E.
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "cache-control": "no-store",
    };
    // Stamp the etag the FLIGHT carried, never `freshEtag` — stamping a signature
    // newer than the body would let the next conditional GET 304 onto a stale
    // value forever. Undefined (opt-out, throwing signature, or a joined push-path
    // flight) → OMIT the header; the client then sends no If-None-Match next time
    // and gets a full body.
    if (etag !== undefined) headers["ETag"] = etag;
    // The body carries `epoch: bootEpoch` so the client can compare its cached
    // `entry.version` cross-boot: per-boot in-memory version counters are only
    // comparable within one boot, so an epoch-less strict-`<` guard dropped a
    // fresh body as "stale" against a stale-boot cache. See Fix B's guard matrix.
    // The body is a full value, so it may also carry the flight's commit watermark
    // (Rule B′) — same adoption discipline as the etag above.
    return new Response(
      JSON.stringify({
        value,
        version,
        epoch: bootEpoch,
        ...(watermark !== undefined ? { watermark } : {}),
      }),
      { headers },
    );
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
      subShortCircuits: number;
      subTabs: Record<string, number>;
      externalSource: boolean;
    }> = [];
    for (const entry of registry.values()) {
      let subscribers = 0;
      // Per-tab breakdown: how many (socket, pk) subs each tab holds for this
      // resource. Legacy untagged subs show under `""`.
      const subTabs: Record<string, number> = {};
      for (const st of sockets.values()) {
        const inner = st.subs.get(entry.key);
        if (!inner) continue;
        subscribers += inner.size;
        for (const rec of inner.values()) {
          for (const tab of rec.tabs) subTabs[tab] = (subTabs[tab] ?? 0) + 1;
        }
      }
      const owner = ownerByKey.get(entry.key);
      // The raw captured read-set (the VIEW/table names loaders actually read)
      // AND its base-resolved projection (views → their identity base), so the
      // ceiling can compare like-for-like with `coveredOrigins` (base-table
      // space) while the captured index keeps the raw names. `resolveRelation` is
      // identity on central (no derived views there).
      const resolve = opts.resolveRelation ?? ((r) => r);
      // Drop feed-exempt rollup tables (derived-tables) from the emitted
      // read-set: the change-feed installs no trigger on them, so they are not
      // in `coveredOrigins` and would otherwise read as a false "silent FULL
      // recompute" — but the source-driven scoped path already covers the
      // change. Filter on the base-resolved name (a rollup is itself a base).
      const feedExempt = opts.feedExemptTables?.() ?? new Set<string>();
      const rawReadSet = (opts.readSet?.(entry.key) ?? []).filter(
        (r) => !feedExempt.has(resolve(r)),
      );
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
        // Version short-circuits served for this key (a replayed sub answered
        // `up-to-date` from the in-memory version counter — zero loader runs,
        // zero read-admission slots). Live re-validation gauge for the
        // 2026-07-11 replay-storm fix.
        subShortCircuits: subShortCircuits.get(entry.key) ?? 0,
        subTabs,
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
  async function loadResourceByKey(
    key: string,
    params?: ResourceParams,
  ): Promise<unknown> {
    const entry = registry.get(key);
    if (!entry) throw new Error(`unknown resource key: ${key}`);
    // Bare value: this caller has no ETag to seed and none to report. Any read-path
    // subscriber that coalesces onto the flight it starts adopts its `undefined`
    // etag and stamps none (see `handleSub`).
    const { value } = await getResourceValue(entry, params ?? {});
    return value;
  }

  // Run one full first-subscribe lifecycle and time it, then tear it down.
  // Mirrors `handleSub`'s 0→1 transition exactly: `onFirstSubscribe` first, then
  // the loader read through the SAME `getResourceValue` single-flight path — then
  // calls `onLastUnsubscribe` so the subcount-0 invariants/eviction are restored
  // and the next cold call recomputes. The two hooks fire exactly once each
  // (symmetric), so this leaves no dangling subscription/watcher. Generic — keyed
  // only by string; never names a concrete resource. Throws on an unknown key
  // (matches `loadResourceByKey`).
  async function measureSubscribeCycle(
    key: string,
    params?: ResourceParams,
  ): Promise<{ onFirstSubscribeMs: number; loaderMs: number }> {
    const entry = registry.get(key);
    if (!entry) throw new Error(`unknown resource key: ${key}`);
    const p = params ?? {};
    const t0 = performance.now();
    await entry.onFirstSubscribe?.(p);
    const onFirstSubscribeMs = performance.now() - t0;
    const t1 = performance.now();
    await getResourceValue(entry, p);
    const loaderMs = performance.now() - t1;
    // Teardown: restore subcount-0 invariants (keyed snapshot eviction, watcher
    // release) so a later cold call recomputes. `onLastUnsubscribe` is typed sync
    // (void), but wrap in Promise.resolve to await defensively in case a hook
    // returns a thenable.
    await Promise.resolve(entry.onLastUnsubscribe?.(p));
    return { onFirstSubscribeMs, loaderMs };
  }

  // Re-emit a registered resource to its current subscribers WITHOUT a DB change.
  // Schedules a notify (tagged "synthetic" so the self-verification counters and
  // the read-set-gap warning are left untouched) so the loader re-runs against an
  // unchanged DB and the keyed diff comes back empty — a real no-op push. Sibling
  // to `loadResourceByKey`. With `params`, targets just that tuple; otherwise fans
  // out to every distinct currently-subscribed params tuple for the key. Returns
  // the number of param-tuples scheduled (0 = nobody listening, push unobservable).
  // Throws on an unknown key (fail loudly). Drives the live-state-churn emitter.
  function triggerResourcePush(key: string, params?: ResourceParams): number {
    const entry = registry.get(key);
    if (!entry) {
      throw new Error(`[resources] triggerResourcePush: unknown key "${key}"`);
    }
    const targets = params ? [params] : subscribedParamsFor(key);
    for (const p of targets) {
      scheduleNotify(entry, p, null, { source: "synthetic" });
    }
    return targets.length;
  }

  // Distinct currently-subscribed params tuples for a resource key, recovered
  // from every socket's `subs` map (the `ResourceParams` objects are stored there
  // at sub time). Deduped by pk across sockets.
  function subscribedParamsFor(key: string): ResourceParams[] {
    const byPk = new Map<string, ResourceParams>();
    for (const st of sockets.values()) {
      const inner = st.subs.get(key);
      if (!inner) continue;
      for (const [pk, rec] of inner) {
        if (!byPk.has(pk)) byPk.set(pk, rec.params);
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
    xid?: string;
  }): void {
    try {
      const affectedKeys = tableToResources().get(change.table);
      if (!affectedKeys || affectedKeys.length === 0) {
        // Unknown/unread table — no resource depends on it (yet). Debug-level,
        // not warn: this is expected for tables no loader has read.
        return;
      }
      // A single-row UPDATE with ids scopes to those rows (Layer-2 `WHERE id IN
      // (…)`) for ANY scoped keyed resource. INSERT/DELETE additionally scope for
      // an M5 `scopedMembership` entry (decided per-entry below, since the field is
      // per-resource); otherwise they remain a membership/order change → FULL. A
      // null/empty id list, or an over-cap statement, is always FULL.
      const hasIds = change.ids != null && change.ids.length > 0;
      const scopedUpdate: Set<string> | null =
        change.op === "U" && hasIds ? new Set(change.ids!) : null;

      for (const key of affectedKeys) {
        const entry = registry.get(key);
        if (!entry) continue;

        // Per-resource scope decision (the unifying rule: an affectedMap edge /
        // the resource's own identity view takes precedence over any other
        // read-set match for the same origin). `deleted` (M5) rides alongside a
        // scoped `affected` for a scopedMembership DELETE (see below).
        let affected: Set<string> | null;
        let deleted: Set<string> | undefined;
        if (coveredOriginsFor(key).has(change.origin)) {
          if (change.origin === entry.identityTable) {
            // Identity-origin change: the identity view is the authoritative path.
            // Drop a duplicate arriving via a SECONDARY view so it can't FULL the
            // scoped identity delivery.
            if (change.identityBase !== entry.identityTable) continue;
            // UPDATE always scopes (today). For a membership entry (window /
            // point / the M5 alias) an INSERT scopes to the new ids and a
            // DELETE scopes to an EMPTY affected set carrying the op-D ids in
            // `deleted` — a deleted row can't be refilled, so the membership
            // diff resolves the exit from `deleted` with ZERO loader runs. A
            // non-membership entry keeps the pre-M5 FULL.
            if (change.op === "U") {
              affected = scopedUpdate;
            } else if (entry.membership && hasIds) {
              if (change.op === "I") {
                affected = new Set(change.ids!);
              } else {
                affected = new Set<string>();
                deleted = new Set(change.ids!);
              }
            } else {
              affected = null;
            }
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

        const subscribed = subscribedParamsFor(key);
        const pointMembership =
          entry.membership?.kind === "point" ? entry.membership : undefined;
        // Fan out to every subscribed params tuple. A param-less resource is
        // always covered (key = {}); a parametrized resource with no current
        // subscribers admits nothing (a fresh subscribe loads from scratch).
        // A POINT entry never fans out to the `{}` fallback tuple — its params
        // ARE the id set, so with no subscribers there is nothing to maintain.
        const targets: ResourceParams[] = pointMembership
          ? subscribed
          : subscribed.length > 0
            ? subscribed
            : [{}];
        for (const params of targets) {
          let tupleAffected = affected;
          let tupleDeleted = deleted;
          // Point routing: a scoped change reaches a subscribed tuple iff the
          // changed ids intersect that tuple's explicit id set (upsert), or a
          // D op hits one of its ids (delete). Empty intersection → the tuple
          // is untouched: no notify, no version bump, no frame. A FULL change
          // (`affected === null`, e.g. an id-less bulk statement) still reaches
          // every tuple — its FULL recompute is the point loader over the
          // tuple's own ids, bounded by construction.
          if (pointMembership && affected !== null) {
            const idSet = new Set(pointMembership.idsOf(params));
            tupleAffected = new Set([...affected].filter((id) => idSet.has(id)));
            tupleDeleted = deleted
              ? new Set([...deleted].filter((id) => idSet.has(id)))
              : undefined;
            if (
              tupleAffected.size === 0 &&
              (tupleDeleted === undefined || tupleDeleted.size === 0)
            ) {
              // Empty intersection: the tuple's value is untouched — but an
              // opted-in ackChannel entry still owes the writer its ack (an
              // optimistic client subscribed to THIS tuple may hold a pending
              // op whose write landed outside the tuple's id set — e.g. a
              // reorder that only moved OTHER rows' ranks). Schedule an
              // ACK-ONLY pending: an empty scoped set carrying only sourceTx,
              // which the membership drain resolves to a standalone ack frame
              // (no version bump, no frame otherwise, no cascade).
              if (entry.ackChannel && change.xid !== undefined) {
                scheduleNotify(entry, params, new Set<string>(), {
                  source: "feed",
                  sourceTx: change.xid,
                });
              }
              continue;
            }
          }
          // Build the RecomputeIntent (the shared L4 contract). Today it is
          // routed straight through `scheduleNotify`; a future work-admission
          // scheduler consumes it on the admit side. Construct it so the
          // producer side is the stable contract surface. Use the REAL op; a
          // membership DELETE names its removed ids (`deleted`), everything
          // else the refill ids.
          const delta: RecomputeIntent["delta"] =
            tupleAffected === null
              ? "FULL"
              : {
                  table: change.table,
                  ids: [...(tupleDeleted ?? tupleAffected)],
                  op: change.op,
                  ...(change.xid !== undefined ? { xid: change.xid } : {}),
                };
          const intent: RecomputeIntent = { resource: key, key: params, delta };
          void intent;
          scheduleNotify(entry, params, tupleAffected, {
            source: "feed",
            deleted: tupleDeleted,
            sourceTx: change.xid,
          });
        }
      }
    } catch (err) {
      // Never throw out of the feed router — a parse/lookup bug must not take down
      // the LISTEN consumer. console.error fires (loud), plus the report hook.
      reportLoaderError(`applyDbChange failed for table "${change.table}"`, err);
    }
  }

  // Force a FULL recompute of one resource by key (param-less → `{}`), through the
  // SAME `scheduleNotify(..., { source: "feed" })` path the feed router uses, so
  // the recompute is byte-identical to a feed-driven one. Used by the L2 boot init
  // for resources with no usable persisted read-set. No-op if the key is unknown.
  function recomputeResource(key: string): void {
    const entry = registry.get(key);
    if (entry) scheduleNotify(entry, {}, null, { source: "feed" });
  }

  function notifyStatsFor(key: string): { hand: number; feed: number } {
    const s = notifyStats.get(key);
    return { hand: s?.hand ?? 0, feed: s?.feed ?? 0 };
  }

  // Enumerate every registered resource that declared a scoped `identityTable`
  // policy. Read straight off the registry (populated at module-import, so this is
  // authoritative by the time any boot hook runs) — covers hand-written AND
  // query-resource-compiled resources identically, because the compiler lowers the
  // drizzle table down to the same `identityTable` string the runtime stores here.
  function scopedResourceIdentities(): Array<{ key: string; identityTable: string }> {
    const out: Array<{ key: string; identityTable: string }> = [];
    for (const entry of registry.values()) {
      if (entry.identityTable) {
        out.push({ key: entry.key, identityTable: entry.identityTable });
      }
    }
    return out;
  }

  // The bounded-membership keys — the same set the L2 persist gate excludes via
  // `membershipBounded`. Reuses that exact predicate so the sweep and the gate
  // can never disagree about which keys are non-persistable.
  function boundedMembershipKeys(): string[] {
    const out: string[] = [];
    for (const entry of registry.values()) {
      if (membershipBounded(entry)) out.push(entry.key);
    }
    return out;
  }

  return {
    defineResource,
    defineExternalResource,
    notificationsWsHandler,
    handleResourceHttp,
    withNotifyBatch,
    loadResourceByKey,
    measureSubscribeCycle,
    triggerResourcePush,
    applyDbChange,
    recomputeResource,
    notifyStatsFor,
    scopedResourceIdentities,
    boundedMembershipKeys,
    readGateStats: () => readLoadGate.stats(),
  };
}
