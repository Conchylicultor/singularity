import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  stageReorderDefault,
  applyReorderDefault,
  applyAllReorderDefaults,
  discardReorderDefault,
} from "../core/endpoints";
import { stagedReorderDefaultsResource } from "./internal/resource";
import {
  handleStageReorderDefault,
  handleApplyReorderDefault,
  handleApplyAllReorderDefaults,
  handleDiscardReorderDefault,
} from "./internal/handlers";
import { landDefaultsJob } from "./internal/land-job";

export { _reorderStagedDefault } from "./internal/tables";
export { stagedReorderDefaultsResource } from "./internal/resource";

export default {
  description:
    "Staging for reorder layouts promoted as committed git-layer defaults: stage/apply/apply-all/discard endpoints, a live resource, the atomic git-layer writer, and a non-blocking job that lands defaults directly on main via a throwaway worktree.",
  httpRoutes: {
    [stageReorderDefault.route]: handleStageReorderDefault,
    [applyReorderDefault.route]: handleApplyReorderDefault,
    [applyAllReorderDefaults.route]: handleApplyAllReorderDefaults,
    [discardReorderDefault.route]: handleDiscardReorderDefault,
  },
  register: [landDefaultsJob],
  contributions: [Resource.Declare(stagedReorderDefaultsResource)],
} satisfies ServerPluginDefinition;
