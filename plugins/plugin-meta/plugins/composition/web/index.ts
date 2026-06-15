import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  useCompositionData,
  useEnsureCompositionData,
  useInclusion,
  useImpact,
} from "./internal/hooks";
export type { CompositionDataResult, ImpactResult } from "./internal/hooks";
export {
  useActiveComposition,
  useActiveMembership,
  useGraph,
  setActiveComposition,
  updateActiveDraft,
  pinAsRoot,
  clearActive,
  useCompareComposition,
  useIsCompareMode,
  useDiffMap,
  setCompareComposition,
} from "./internal/store";
export type { DiffState } from "./internal/store";

export default {
  description:
    "Web hooks + active-composition store for the Studio closure visualization: fetches and deserializes the edge graph once, holds the working draft, and derives membership / inclusion / impact client-side.",
  contributions: [],
} satisfies PluginDefinition;
