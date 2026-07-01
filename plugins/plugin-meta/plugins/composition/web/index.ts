import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { compositionsConfig } from "@plugins/plugin-meta/plugins/composition/core";

export {
  useCompositionData,
  useEnsureCompositionData,
  useDisabledClosure,
  useInclusion,
  useImpact,
} from "./internal/hooks";
export type { CompositionDataResult, ImpactResult } from "./internal/hooks";
export { useManifestItems, useManifestActions } from "./internal/manifests";
export type { ManifestActions } from "./internal/manifests";
export { usePromoteManifestsToGit } from "./internal/promote";
export type { PromoteManifestsToGit } from "./internal/promote";
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
    "Web hooks + active-composition store for the Studio closure visualization: fetches and deserializes the edge graph once, holds the working draft, and derives membership / inclusion / impact client-side. Owns the manifest read/write API over the compositions config_v2 config.",
  contributions: [ConfigV2.WebRegister({ descriptor: compositionsConfig })],
} satisfies PluginDefinition;
