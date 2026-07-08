import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { defineWarmup } from "./internal/registry";
export type { WarmupSpec } from "./internal/registry";
export { drainWarmups, WARMUP_CONCURRENCY } from "./internal/executor";

export default {
  description:
    "Declared heavy boot warm-up category: defineWarmup registers a deferred, throttled, scope-gated warm-up; drainWarmups drains them after onAllReady under a concurrency gate + heavy-read slot + macrotask yield.",
} satisfies ServerPluginDefinition;
