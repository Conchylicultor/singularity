import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  stageConfigDefault,
  applyConfigDefault,
  applyAllConfigDefaults,
  discardConfigDefault,
  discardAllConfigDefaults,
} from "../core/endpoints";
import { stagedConfigDefaultsResource } from "./internal/resource";
import {
  handleStageConfigDefault,
  handleApplyConfigDefault,
  handleApplyAllConfigDefaults,
  handleDiscardConfigDefault,
  handleDiscardAllConfigDefaults,
} from "./internal/handlers";
import { landDefaultsJob } from "./internal/land-job";

export { _stagedConfigDefault } from "./internal/tables";
export { stagedConfigDefaultsResource } from "./internal/resource";

export default {
  description:
    "Generic config_v2 git-promotion staging: stage/apply/apply-all/discard endpoints for any promotableToGit descriptor, a live staged-defaults resource, the atomic git-layer writer, and a non-blocking job that lands the full config document directly on main via a throwaway worktree.",
  httpRoutes: {
    [stageConfigDefault.route]: handleStageConfigDefault,
    [applyConfigDefault.route]: handleApplyConfigDefault,
    [applyAllConfigDefaults.route]: handleApplyAllConfigDefaults,
    [discardConfigDefault.route]: handleDiscardConfigDefault,
    [discardAllConfigDefaults.route]: handleDiscardAllConfigDefaults,
  },
  register: [landDefaultsJob],
  contributions: [Resource.Declare(stagedConfigDefaultsResource)],
} satisfies ServerPluginDefinition;
