import { Core, type PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { StagedDefaultsOverlayHost } from "./internal/staged-defaults-host";

export {
  stagedConfigDefaultsResource,
  StagedConfigDefaultSchema,
} from "../core/resources";
export type { StagedConfigDefault } from "../core/resources";
export {
  useStageConfigDefault,
  useApplyConfigDefault,
  useApplyAllConfigDefaults,
  useDiscardConfigDefault,
  useDiscardAllConfigDefaults,
} from "./hooks";
export {
  useStagedValue,
  useStageDefault,
  useHasStagedDefaults,
  useStagedKeys,
} from "./internal/staged-defaults-store";
export type { StagedKey } from "./internal/staged-defaults-store";
export {
  Staging,
  useStagingDiffRenderers,
} from "./internal/diff-slot";
export type { StagedDiffProps, StagingDiffRenderer } from "./internal/diff-slot";
export { GenericConfigDiff } from "./internal/generic-diff";

export default {
  description:
    "Generic config_v2 git-promotion staging (web): the optimistic staged-defaults overlay host, mutation + store hooks, the pluggable diff-renderer slot, and the generic structural diff fallback. Any promotableToGit descriptor's runtime edit can be promoted to a committed git-layer default.",
  contributions: [
    // Single app-wide headless host: owns the one optimistic overlay on the
    // staged-defaults resource and publishes it to the module store every
    // consumer reads. Core.Root mounts exactly once, inside
    // NotificationsProvider, so the live-state read works.
    Core.Root({ component: StagedDefaultsOverlayHost }),
  ],
} satisfies PluginDefinition;
