import { Core, type PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { StagedDefaultsOverlayHost } from "./internal/staged-defaults-host";

export {
  stagedReorderDefaultsResource,
  StagedReorderDefaultSchema,
} from "../shared/resources";
export type { StagedReorderDefault } from "../shared/resources";
export {
  useStageReorderDefault,
  useApplyReorderDefault,
  useApplyAllReorderDefaults,
  useDiscardReorderDefault,
  useDiscardAllStagedDefaults,
} from "./hooks";
export {
  useStagedTree,
  useStageDefault,
  useHasStagedDefaults,
  useStagedSlotIds,
} from "./internal/staged-defaults-store";

export default {
  description:
    "Web hooks for staging reorder layouts as committed git-layer defaults (stage/apply/apply-all/discard) plus the staged-defaults live resource descriptor.",
  contributions: [
    // Single app-wide headless host: owns the one optimistic overlay on the
    // staged-defaults resource and publishes it to the module store every
    // reorderable slot and both pen buttons read. Core.Root mounts exactly once,
    // inside NotificationsProvider, so the live-state read works.
    Core.Root({ component: StagedDefaultsOverlayHost }),
  ],
} satisfies PluginDefinition;
