// Profiler seam (dependency inversion).
//
// server-core's resource runtime needs profiler instrumentation, but the
// profiler (`infra/plugins/runtime-profiler`) is an INFRA plugin that sits ABOVE
// the framework core — every server plugin (runtime-profiler included) imports
// `ServerPluginDefinition` from here, so a direct `server-core → runtime-profiler`
// import made the cross-plugin graph cyclic. Instead, server-core declares the
// hooks it needs here with safe no-op defaults, and runtime-profiler INJECTS the
// real implementation at boot via `setProfilerHooks` — mirroring the
// `setErrorReporter` pattern in ./error-reporter.

/** Minimal view of a loader aggregate that server-core reads for the _debug endpoint. */
export interface LoaderAggregateView {
  label: string;
  count: number;
  maxMs: number;
}

/** Minimal view of the runtime profile server-core reads (loader aggregates + window origin). */
export interface RuntimeProfileView {
  aggregates: { loader: LoaderAggregateView[] };
  sinceMs: number;
}

/**
 * The profiler operations server-core's resource runtime depends on. Param types
 * are deliberately widened (`kind`/`layer` as `string`) so the framework core
 * carries no profiler-internal type (`SpanKind`, `GateGauge`); runtime-profiler
 * supplies a matching implementation and owns any casts.
 */
export interface ProfilerHooks {
  recordEntrySpan<T>(kind: string, label: string, fn: () => T | Promise<T>): Promise<T>;
  recordSpan(kind: string, label: string, durationMs: number): void;
  chargeWait(layer: string, ms: number): void;
  getRuntimeProfile(): RuntimeProfileView;
  getReadSetIndex(): Record<string, string[]>;
  /** Per-run read-set of a key's most recent loader run (undefined if none). */
  getLastLoaderReadSet(key: string): string[] | undefined;
  registerGateGauge(layer: string, read: () => unknown): void;
}

let hooks: ProfilerHooks | null = null;

// Gate gauges registered before the profiler is installed. The resource runtime
// registers its read-admit gauge at module-load of resources.ts — which happens
// (server-core/core is imported by every plugin) before the runtime-profiler
// plugin's boot side-effect calls setProfilerHooks. Buffer and replay on inject
// so the gauge is never silently dropped.
const pendingGauges: Array<{ layer: string; read: () => unknown }> = [];

export function setProfilerHooks(impl: ProfilerHooks): void {
  hooks = impl;
  for (const g of pendingGauges) impl.registerGateGauge(g.layer, g.read);
  pendingGauges.length = 0;
}

export function recordEntrySpan<T>(
  kind: string,
  label: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  return hooks ? hooks.recordEntrySpan(kind, label, fn) : Promise.resolve(fn());
}

export function recordSpan(kind: string, label: string, durationMs: number): void {
  hooks?.recordSpan(kind, label, durationMs);
}

export function chargeWait(layer: string, ms: number): void {
  hooks?.chargeWait(layer, ms);
}

export function getRuntimeProfile(): RuntimeProfileView {
  return hooks ? hooks.getRuntimeProfile() : { aggregates: { loader: [] }, sinceMs: performance.now() };
}

export function getReadSetIndex(): Record<string, string[]> {
  return hooks ? hooks.getReadSetIndex() : {};
}

export function getLastLoaderReadSet(key: string): string[] | undefined {
  return hooks ? hooks.getLastLoaderReadSet(key) : undefined;
}

export function registerGateGauge(layer: string, read: () => unknown): void {
  if (hooks) hooks.registerGateGauge(layer, read);
  else pendingGauges.push({ layer, read });
}
