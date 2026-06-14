import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  stageReorderDefault,
  applyReorderDefault,
  discardReorderDefault,
} from "../core/endpoints";
import { stagedReorderDefaultsResource } from "./internal/resource";
import {
  handleStageReorderDefault,
  handleApplyReorderDefault,
  handleDiscardReorderDefault,
} from "./internal/handlers";

export { _reorderStagedDefault } from "./internal/tables";
export { stagedReorderDefaultsResource } from "./internal/resource";

export default {
  description:
    "Worktree-local staging for reorder layouts promoted as committed git-layer defaults: stage/apply/discard endpoints, a live resource, and the atomic git-layer writer.",
  httpRoutes: {
    [stageReorderDefault.route]: handleStageReorderDefault,
    [applyReorderDefault.route]: handleApplyReorderDefault,
    [discardReorderDefault.route]: handleDiscardReorderDefault,
  },
  contributions: [Resource.Declare(stagedReorderDefaultsResource)],
} satisfies ServerPluginDefinition;
