import { createResourceRuntime } from "@plugins/framework/plugins/resource-runtime/core";
import type {
  Resource as RtResource,
  ResourceDefinition as RtDef,
  ResourceMode as RtMode,
  ResourceParams as RtParams,
  DependsOnEntry as RtDep,
} from "@plugins/framework/plugins/resource-runtime/core";
import { recordEntrySpan } from "@plugins/infra/plugins/runtime-profiler/core";
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
export const Resource = {
  Declare: defineServerContribution<{ key: string; mode: ResourceMode }>(
    "resource.declare",
  ),
};

function errorReport(context: string, err: unknown): ServerErrorReport {
  const e = err instanceof Error ? err : new Error(String(err));
  return {
    message: `[resources] ${context}: ${e.message}`,
    stack: e.stack ?? null,
    errorType: e.constructor.name !== "Error" ? e.constructor.name : null,
  };
}

const runtime = createResourceRuntime({
  wrapLoad: (key, fn) => recordEntrySpan("loader", key, fn),
  reportError: (ctx, err) => reportServerError(errorReport(ctx, err)),
  debugOwners: () =>
    Resource.Declare.getContributions().map((c) => ({
      key: c.key,
      pluginId: c._pluginId,
      pluginName: c._pluginName,
    })),
});

export const { defineResource, notificationsWsHandler, handleResourceHttp, withNotifyBatch } =
  runtime;
