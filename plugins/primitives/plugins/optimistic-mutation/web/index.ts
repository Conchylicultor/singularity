import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useOptimisticResource } from "./internal/use-optimistic-resource";
export type {
  UseOptimisticResourceArgs,
  UseOptimisticResourceResult,
} from "./internal/use-optimistic-resource";
export { OpNoLongerApplies } from "./internal/overlay";

export default {
  description:
    "Optimistic-mutation primitive over live-state: useOptimisticResource replays pending ops on server truth (overlay/replay), with coarse and content-based confirmation and automatic rollback on reject.",
  contributions: [],
} satisfies PluginDefinition;
