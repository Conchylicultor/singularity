import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  stagedReorderDefaultsResource,
  StagedReorderDefaultSchema,
} from "../shared/resources";
export type { StagedReorderDefault } from "../shared/resources";
export {
  useStageReorderDefault,
  useApplyReorderDefault,
  useDiscardReorderDefault,
} from "./hooks";

export default {
  description:
    "Web hooks for staging reorder layouts as committed git-layer defaults (stage/apply/discard) plus the staged-defaults live resource descriptor.",
  contributions: [],
} satisfies PluginDefinition;
