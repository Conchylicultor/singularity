import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { LEGACY_BUILD_FILE, LEGACY_PUSH_FILE, OP_LOG_FILE } from "./internal/jsonl";
export { createOpProfiler } from "./internal/profiler";
export type { OpProfiler, OpProfilerOptions } from "./internal/profiler";
export { finalizeOrphanedOps, readOpRecords } from "./internal/read";
// The pure types + fold live in `../core` (both runtimes share them); consumers
// import them from there. Only the fs/process-touching writer, reader, and
// reconciler live here.

export default {
  description:
    "Unified op log: the one durable record for every host-contending op (build / push / check), its per-resource wait list, the writer, the merged reader (incl. read-only legacy adapters), and the single orphan reconciler.",
} satisfies ServerPluginDefinition;
