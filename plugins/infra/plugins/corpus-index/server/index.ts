import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { defineCorpusIndex } from "./internal/corpus-index";
export type { CorpusIndexSpec, CorpusIndex, CorpusDelta } from "./internal/corpus-index";

export default {
  description:
    "Fingerprint-keyed incremental file index: defineCorpusIndex enumerates files under roots matching a predicate, re-parses only those whose (mtimeMs,size) changed through a bounded heavy-read-gated pipeline, drops vanished entries, and persists atomically (host scope ⇒ main-only). ensureFresh is the lazy on-read correctness fallback; startWatcher is main-only push freshness.",
} satisfies ServerPluginDefinition;
