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

export interface Resource<T, P extends ResourceParams = ResourceParams> {
  key: string;
  mode: ResourceMode;
  schema: ZodType<T>;
  load(params: P): Promise<T>;
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
}

interface RegistryEntry {
  key: string;
  mode: ResourceMode;
  /** Payload schema. The loader output is parsed against it in `timedLoad`. */
  schema: ZodType<unknown>;
  loader: (
    params: ResourceParams,
    ctx?: { affectedIds: readonly string[] },
  ) => Promise<unknown> | unknown;
  /** Row identity for keyed mode. Undefined for push/invalidate entries. */
  keyOf?: (row: unknown) => string;
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
  /** Report a loader/map/lifecycle failure. console.error ALWAYS fires inside the runtime;
   *  this is the extra hook. server: reportServerError(errorReport(ctx, err)); central: omit. */
  reportError?: (context: string, err: unknown) => void;
  /** Per-key owner metadata for the _debug endpoint. server: from Resource.Declare; central: omit. */
  debugOwners?: () => Array<{ key: string; pluginId?: string }>;
}

export interface ResourceRuntime {
  defineResource: <T, P extends ResourceParams = ResourceParams>(
    def: ResourceDefinition<T, P>,
  ) => Resource<T, P>;
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
}

const HEARTBEAT_MS = 20_000;

export function createResourceRuntime(opts: ResourceRuntimeOptions = {}): ResourceRuntime {
  const registry = new Map<string, RegistryEntry>();
  const inflight = createInflight();
  let dagDirty = true;
  let topoOrder: RegistryEntry[] = [];
  const sockets = new Map<ServerWebSocket<WsData>, SocketState>();
  let flushScheduled = false;
  let batchDepth = 0;
  const heartbeats = new Map<ServerWebSocket<WsData>, ReturnType<typeof setInterval>>();

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
      map.set(pk, { params, affected: incoming === null ? null : new Set(incoming) });
      return;
    }
    if (existing.affected === null) return; // FULL absorbs everything
    if (incoming === null) {
      existing.affected = null; // degrade to FULL
      return;
    }
    for (const id of incoming) existing.affected.add(id);
  }

  function defineResource<T, P extends ResourceParams = ResourceParams>(
    def: ResourceDefinition<T, P>,
  ): Resource<T, P> {
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
      schema: def.schema as ZodType<unknown>,
      loader: def.loader as (
        params: ResourceParams,
        ctx?: { affectedIds: readonly string[] },
      ) => Promise<unknown> | unknown,
      keyOf: def.keyOf as ((row: unknown) => string) | undefined,
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
      for (const upKey of entry.upstreamKeys) {
        const up = registry.get(upKey);
        if (!up) {
          console.warn(
            `[resources] "${entry.key}" depends on unknown resource "${upKey}" (upstream not yet defined at ${entry.key}'s registration time?)`,
          );
          continue;
        }
        visit(up, stack);
      }
      stack.pop();
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
  ): void {
    mergePending(entry.pendingNotifies, paramsKey(params), params, affected);
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
    flushScheduled = false;
    rebuildDag();

    // Iterate upstream-first so cascades into downstream entries are picked up
    // later in the same loop. `pendingNotifies` is a Map keyed by paramsKey, so
    // cascaded-then-pre-existing notifies coalesce automatically.
    for (const entry of topoOrder) {
      if (entry.pendingNotifies.size === 0) continue;
      const pending = Array.from(entry.pendingNotifies.values());
      entry.pendingNotifies.clear();
      // Piggyback: this entry's pending is being drained now (possibly by a flush
      // some other resource scheduled), so cancel any armed debounce timer — it
      // would otherwise fire redundantly on an already-empty pending map.
      if (entry.debounceTimer !== undefined) {
        clearTimeout(entry.debounceTimer);
        entry.debounceTimer = undefined;
      }
      for (const { params, affected } of pending) {
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
              }
            }
          } else {
            const msg = { kind: "update" as const, key: entry.key, params, value, version };
            for (const s of subs) sendJson(s.ws, msg);
          }
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
      versions: Record<string, number>;
      dependsOn: string[];
      downstream: string[];
    }> = [];
    for (const entry of registry.values()) {
      let subscribers = 0;
      for (const st of sockets.values()) {
        const inner = st.subs.get(entry.key);
        if (inner) subscribers += inner.size;
      }
      const owner = ownerByKey.get(entry.key);
      out.push({
        key: entry.key,
        mode: entry.mode,
        pluginId: owner?.pluginId,
        subscribers,
        versions: Object.fromEntries(entry.versions),
        dependsOn: entry.upstreamKeys,
        downstream: entry.downstream.map((d) => d.downstreamKey),
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

  return {
    defineResource,
    notificationsWsHandler,
    handleResourceHttp,
    withNotifyBatch,
    loadResourceByKey,
  };
}
