import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { defineWarmup, listRegisteredWarmups } from "./internal/registry";
export type { RegisteredWarmup, WarmupSpec } from "./internal/registry";
export { drainWarmups, WARMUP_CONCURRENCY } from "./internal/executor";
export type { WarmupRun } from "./internal/executor";
export { onWarmupRun, warmupRunOf } from "./internal/runs";

export default {
  description:
    "Declared heavy boot warm-up category: defineWarmup registers a deferred, throttled, scope-gated warm-up; drainWarmups drains them after onAllReady under a concurrency gate + heavy-read slot + macrotask yield, recording each warm-up's run in memory (warmupRunOf / onWarmupRun); listRegisteredWarmups lists the declared set with the plugin that declared each.",
} satisfies ServerPluginDefinition;
