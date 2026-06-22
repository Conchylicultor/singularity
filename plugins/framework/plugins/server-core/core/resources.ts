import { createResourceRuntime } from "@plugins/framework/plugins/resource-runtime/core";
import type {
  Resource as RtResource,
  ExternalResource as RtExternalResource,
  ResourceDefinition as RtDef,
  ResourceContract as RtContract,
  ServerResourceOptions as RtServerOpts,
  ResourceMode as RtMode,
  ResourceParams as RtParams,
  DependsOnEntry as RtDep,
  RecomputeIntent as RtRecomputeIntent,
} from "@plugins/framework/plugins/resource-runtime/core";
import {
  recordEntrySpan,
  recordSpan,
  getRuntimeProfile,
  getReadSetIndex,
} from "@plugins/infra/plugins/runtime-profiler/core";
import { defineServerContribution } from "./contributions";
import { reportServerError, type ServerErrorReport } from "./error-reporter";

// Live-state primitive — per-worktree server side. The runtime itself lives in
// @plugins/framework/plugins/resource-runtime/core (shared with central-core);
// this file is the stable server-core facade: it instantiates the runtime with
// the server's hooks (profiler spans, error reporting, declare-based debug
// owners) and re-presents the runtime types as server-core's public surface.
// See research/2026-04-15-global-sse-lifecycle-mental-model-v3.md and
// research/2026-06-08-global-unify-live-state-resource-runtime.md.
//
// A plugin calls defineResource({key, loader, schema, mode?}). The server exposes:
//   GET /api/resources/:key                      — HTTP fallback
//   WS  /ws/notifications                        — single push channel
// and broadcasts updates when the plugin calls resource.notify().

// Re-present the runtime types as server-core's stable public surface (type
// aliases are permitted in barrels; keeps the ~42 consumers untouched).
export type ResourceParams = RtParams;
export type ResourceMode = RtMode;
export type Resource<T, P extends ResourceParams = ResourceParams> = RtResource<T, P>;
export type ExternalResource<T, P extends ResourceParams = ResourceParams> = RtExternalResource<
  T,
  P
>;
export type ResourceDefinition<T, P extends ResourceParams = ResourceParams> = RtDef<T, P>;
// Two-arg `defineResource(contract, serverOpts)` surface: `contract` is the
// browser-safe shared descriptor (key/schema/keyed), `serverOpts` the DB half.
// Lets a keyed resource declare its keyed-ness in ONE place — the client
// descriptor — instead of restating `mode`/`keyOf` on the server and drifting.
export type ResourceContract<T, P extends ResourceParams = ResourceParams> = RtContract<T, P>;
export type ServerResourceOptions<T, P extends ResourceParams = ResourceParams> = RtServerOpts<
  T,
  P
>;
export type DependsOnEntry<P extends ResourceParams = ResourceParams> = RtDep<P>;
// The shared L4 change-feed contract (see resource-runtime/core). The DB
// change-feed plugin consumes `applyDbChange` (below); this type is the producer
// surface a future work-admission scheduler reconciles against.
export type RecomputeIntent = RtRecomputeIntent;

// Resource.Declare stays here — its ~37 contributors import it from server-core.
// `bootCritical` is an optional opt-in: a param-less global resource flagged
// boot-critical is warmed server-side and hydrated client-side before first
// paint. Consumers read it via the generic collection
// (`Resource.Declare.getContributions().filter(c => c.bootCritical)`), never by
// naming a specific resource. See research/2026-06-14-global-cold-load-instant-boot.md.
//
// Declare takes the resource (its `key`/`mode` satisfy the payload shape) plus
// an optional opts object so a call site reads
// `Resource.Declare(myResource, { bootCritical: true })`. Both args are merged
// into one contribution payload; the underlying token still owns the registry
// and the generic `getContributions()` read side.
type ResourceDeclarePayload = {
  key: string;
  mode: ResourceMode;
  bootCritical?: boolean;
};

const declareToken = defineServerContribution<ResourceDeclarePayload>(
  "resource.declare",
);

const declareResource = ((
  resource: ResourceDeclarePayload,
  opts?: { bootCritical?: boolean },
) => declareToken({ ...resource, ...opts })) as typeof declareToken & {
  (resource: ResourceDeclarePayload, opts?: { bootCritical?: boolean }): ReturnType<
    typeof declareToken
  >;
};
declareResource.getContributions = declareToken.getContributions;

export const Resource = {
  Declare: declareResource,
};

// Maps a captured read-set relation to its identity base table for the `_debug`
// ceiling (views → their base, so it compares like-for-like with the base-table
// `coveredOrigins`). The resolver lives in derived-views (which owns the View
// registry), but server-core/core must NOT statically import a feature plugin —
// that would cycle (derived-views/server already imports server-core/core). So it
// is injected at boot via `setRelationResolver`: change-feed (the DB↔live-state
// bridge that already imports both barrels) wires in `relationIdentityBase` once
// the View registry is built. The holder defaults to identity, so the ceiling is
// correct (raw == base) before the setter runs and on central (no views); the
// closure passed to the runtime reads the CURRENT holder at call time, so it is
// harmless that the runtime is constructed before the setter is called.
let relationResolver: (relation: string) => string = (r) => r;
export function setRelationResolver(fn: (relation: string) => string): void {
  relationResolver = fn;
}

// L2 persisted-materialization hooks — injected at boot by the
// `live-state-snapshot` feature plugin (the same byte-for-byte pattern as
// `setRelationResolver`). server-core/core MUST NOT statically import that plugin
// (it imports `@plugins/database/server` + this barrel — a static import here
// would cycle). So the plugin calls `setLiveStateSnapshotHooks` once at boot and
// the runtime closures below read the CURRENT holders at call time. Before
// injection (and on central, which never installs them) every hook is the inert
// default: `shouldPersist` returns false → no resource is persisted, and the
// capture/persist hooks are never reached. The runtime is constructed before the
// setter runs, which is harmless because the closures dereference the holder
// lazily. See research/2026-06-22-global-live-state-l2-persisted-materialization.md.
export interface LiveStateSnapshotHooks {
  shouldPersist: (key: string) => boolean;
  captureWatermark: () => Promise<string>;
  persistSnapshot: (
    key: string,
    paramsKey: string,
    value: unknown,
    watermark: string,
    tablesRead: readonly string[],
  ) => Promise<void>;
}
let liveStateSnapshotHooks: LiveStateSnapshotHooks | null = null;
export function setLiveStateSnapshotHooks(hooks: LiveStateSnapshotHooks): void {
  liveStateSnapshotHooks = hooks;
}

function errorReport(context: string, err: unknown): ServerErrorReport {
  const e = err instanceof Error ? err : new Error(String(err));
  return {
    message: `[resources] ${context}: ${e.message}`,
    stack: e.stack ?? null,
    errorType: e.constructor.name !== "Error" ? e.constructor.name : null,
  };
}

// Push-outcome observer registry (the `onSlowSpan` shape): lets other plugins
// subscribe to per-push outcomes (was the push a real content change, or a wasted
// no-op?) WITHOUT server-core importing them. The runtime emits `onPush` once per
// keyed push to >=1 subscriber; we fan it out to every registered observer. A
// debug plugin registers at boot via `onResourcePush` from this barrel.
export type ResourcePushObserver = (
  key: string,
  info: { subscribers: number; changed: boolean },
) => void;
const pushObservers = new Set<ResourcePushObserver>();
export function onResourcePush(cb: ResourcePushObserver): () => void {
  pushObservers.add(cb);
  return () => pushObservers.delete(cb);
}

// `wrapLoad` only establishes the profiler entry span + ambient context for the
// loader body. Concurrency is NOT bounded here: the scarce resource is DB
// connections, not loader bodies, so the gate lives at the one place those are
// consumed — the wrapped `pool.query` in `database/server/internal/client.ts`,
// which caps loader-kind queries and reserves capacity for interactive work. An
// in-memory loader that issues no query therefore never waits. See
// research/2026-06-19-global-live-state-unified-read-path-v2.md (Task 2).
const runtime = createResourceRuntime({
  wrapLoad: (key, fn) => recordEntrySpan("loader", key, fn),
  // Origin entry for sub-ack / push-cascade loads: gives the nested loader span a
  // non-null `parent` naming the request class that triggered it, so head-of-line
  // blocking is attributable. See
  // research/2026-06-19-global-wait-attribution-instrumentation.md.
  wrapOrigin: (kind, key, fn) => recordEntrySpan(kind, key, fn),
  // The notify-flush cycle as one `flush` entry — the per-resource `push` loads
  // it triggers nest under it (byParent = head-of-line attribution). See
  // research/2026-06-19-global-observability-frequency-delivery-and-dead-job-gc.md.
  wrapFlush: (fn) => recordEntrySpan("flush", "flushNotifies", fn),
  // Delivery latency as a `push` leaf under the active `flush` entry: enqueue→send
  // time per resource (first-notify staleness window). Attributes to the resource.
  onDelivered: (key, latencyMs) => recordSpan("push", `deliver:${key}`, latencyMs),
  // Loader frequency for the _debug endpoint: find this key's loader aggregate in
  // the current profiling window and derive count / calls-per-minute / slowest.
  loaderStats: (key) => {
    const profile = getRuntimeProfile();
    const agg = profile.aggregates.loader.find((a) => a.label === key);
    if (!agg) return undefined;
    const windowMin = Math.max((performance.now() - profile.sinceMs) / 60_000, 1 / 60_000);
    return {
      count: agg.count,
      ratePerMin: agg.count / windowMin,
      maxMs: agg.maxMs,
    };
  },
  // Automatic loader→table read-set for the _debug endpoint: the tables each
  // loader actually read, captured at the DB pool chokepoint. central: omitted
  // (field absent). Surfaces gaps/over-broad edges vs the hand-drawn dependsOn.
  readSet: (key) => getReadSetIndex()[key] ?? [],
  // Resolve a read-set relation to its identity base table, so the _debug ceiling
  // compares the base-resolved read-set against the base-table `coveredOrigins`.
  // The closure reads the boot-injected holder at call time (set by change-feed
  // to `relationIdentityBase`); identity until then and on central.
  resolveRelation: (r) => relationResolver(r),
  // L2 persisted materialization. All three read the boot-injected holder at call
  // time (set by the live-state-snapshot plugin once the DB is ready). Until then
  // — and on central, which never installs them — `shouldPersist` returns false,
  // so no resource is ever persisted and the capture/persist hooks are never hit.
  shouldPersist: (key) => liveStateSnapshotHooks?.shouldPersist(key) ?? false,
  captureWatermark: () => {
    if (!liveStateSnapshotHooks) {
      // Unreachable: the runtime only calls this when shouldPersist returned true,
      // which requires the hooks to be installed. Fail loudly if that invariant
      // is ever violated rather than persisting a value with no watermark.
      throw new Error("captureWatermark called before live-state-snapshot hooks installed");
    }
    return liveStateSnapshotHooks.captureWatermark();
  },
  persistSnapshot: (key, paramsKey, value, watermark, tablesRead) => {
    if (!liveStateSnapshotHooks) {
      throw new Error("persistSnapshot called before live-state-snapshot hooks installed");
    }
    return liveStateSnapshotHooks.persistSnapshot(key, paramsKey, value, watermark, tablesRead);
  },
  reportError: (ctx, err) => reportServerError(errorReport(ctx, err)),
  // Fan each push outcome out to every registered observer (no-op detector et al).
  onPush: (key, info) => {
    for (const cb of pushObservers) cb(key, info);
  },
  debugOwners: () =>
    Resource.Declare.getContributions().map((c) => ({
      key: c.key,
      pluginId: c._pluginId,
    })),
});

export const {
  defineResource,
  // Escape-hatch factory: resources whose truth lives outside Postgres keep a
  // callable `notify()`. DB-backed resources use `defineResource` (no `notify`).
  defineExternalResource,
  notificationsWsHandler,
  handleResourceHttp,
  withNotifyBatch,
  loadResourceByKey,
  // Re-emit a registered resource to its current subscribers without a DB change
  // (a real no-op push). Drives the live-state-churn deterministic-churn emitter.
  triggerResourcePush,
  // L4 DB change-feed router: the change-feed plugin's LISTEN consumer calls this
  // with each parsed DB change to route it through the recompute cascade.
  applyDbChange,
  // L2 boot init: force a FULL recompute of one resource (no usable persisted
  // read-set yet), re-persisting its value AND read-set for the next boot.
  recomputeResource,
  // L4 self-verification counters (hand vs feed) for the read-set debug pane.
  notifyStatsFor,
} = runtime;
