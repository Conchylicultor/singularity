import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useOptimisticResource } from "./internal/use-optimistic-resource";
export type {
  UseOptimisticResourceArgs,
  UseOptimisticResourceResult,
} from "./internal/use-optimistic-resource";
export { OpNoLongerApplies } from "./internal/overlay";
export { optimisticDivergenceReportSink } from "./reporter";
export type { OptimisticDivergenceReport } from "./reporter";

export default {
  description:
    "Optimistic-mutation primitive over live-state: useOptimisticResource replays pending ops on server truth (overlay/replay) under the never-revert policy — causal (ack-watermark) and content-based confirmation, denial only under causal proof, and keep-rendered failures with reconnect auto-retry.",
  contributions: [],
} satisfies PluginDefinition;
