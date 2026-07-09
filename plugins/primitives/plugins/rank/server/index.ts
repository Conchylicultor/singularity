import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { nextRankIn, nextRankUnder, rankAfterSibling } from "./internal/helpers";
export type { RankExecutor } from "./internal/helpers";
// Re-exported so agents implementing a ranked table find both the column type
// and the helpers in one place.
export { rankText } from "@plugins/primitives/plugins/rank/core";

export default {
  description:
    "Fractional-indexing rank primitive. THE authoritative source for sortable rank strings. Use nextRankIn() for flat tables, nextRankUnder() for parent-scoped lists. Re-exports rankText column type. Never use floats or integers for ordering.",
} satisfies ServerPluginDefinition;
