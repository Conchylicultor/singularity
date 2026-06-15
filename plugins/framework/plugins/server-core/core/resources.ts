import { createResourceRuntime } from "@plugins/framework/plugins/resource-runtime/core";
import type {
  Resource as RtResource,
  ResourceDefinition as RtDef,
  ResourceMode as RtMode,
  ResourceParams as RtParams,
  DependsOnEntry as RtDep,
} from "@plugins/framework/plugins/resource-runtime/core";
import { recordEntrySpan, recordSpan } from "@plugins/infra/plugins/runtime-profiler/core";
import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
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
export type ResourceDefinition<T, P extends ResourceParams = ResourceParams> = RtDef<T, P>;
export type DependsOnEntry<P extends ResourceParams = ResourceParams> = RtDep<P>;

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

function errorReport(context: string, err: unknown): ServerErrorReport {
  const e = err instanceof Error ? err : new Error(String(err));
  return {
    message: `[resources] ${context}: ${e.message}`,
    stack: e.stack ?? null,
    errorType: e.constructor.name !== "Error" ? e.constructor.name : null,
  };
}

// Bound concurrent loader execution per worktree. A single live-state cascade
// flush can fire ~10 dependent loaders in one microtask; with many worktrees
// sharing one embedded Postgres on a few cores, that herd all hits
// `pool.connect()` at once → acquire-wait stalls (see
// research/2026-06-15-global-live-state-cascade-contention.md, Change 4). Cap
// concurrent loader bodies below the per-worktree pool `max` (16) so the herd
// queues at the semaphore instead of the pool, leaving headroom for
// mutation/HTTP queries.
//
// The semaphore wraps OUTSIDE recordEntrySpan, so queue-wait is excluded from
// the `loader` span — loader attribution stays about real work, not queueing.
// To keep the gate observable (otherwise this would just move backpressure from
// the visible `db [acquire]` stall to an unmeasured place), the wait is recorded
// as its own `db [loader-acquire]` span via `onWait`. It sits right next to the
// pool's own `[acquire]` in `get_runtime_profile kind:"db"` — the two stack as
// the outer (semaphore) and inner (pool) layers of acquisition cost, so a
// saturated cap stays loud instead of silent. `recordSpan` attributes it to the
// enclosing http/loader entry, exactly like `[acquire]`.
const LOADER_CONCURRENCY = 10;
const loaderSemaphore = createSemaphore(LOADER_CONCURRENCY);

const runtime = createResourceRuntime({
  wrapLoad: (key, fn) =>
    loaderSemaphore.run(
      () => recordEntrySpan("loader", key, fn),
      (waitMs) => recordSpan("db", "[loader-acquire]", waitMs),
    ),
  reportError: (ctx, err) => reportServerError(errorReport(ctx, err)),
  debugOwners: () =>
    Resource.Declare.getContributions().map((c) => ({
      key: c.key,
      pluginId: c._pluginId,
    })),
});

export const {
  defineResource,
  notificationsWsHandler,
  handleResourceHttp,
  withNotifyBatch,
  loadResourceByKey,
} = runtime;
