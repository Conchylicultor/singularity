import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { refAdvanced } from "./internal/tables-ref-advanced";
import { refHeadResource } from "./internal/ref-head-resource";
import { startGitWatcher, stopGitWatcher } from "./internal/watcher";

export { refHeadResource } from "./internal/ref-head-resource";
export {
  refAdvanced,
  _refAdvancedTriggers,
} from "./internal/tables-ref-advanced";
export { lastKnownMainSha } from "./internal/watcher";
export { defineRefReaction } from "./internal/reactions";
export type { RefReactionSpec } from "./internal/reactions";
export type { RefAdvancedPayload, RefHead } from "../shared/types";
export { RefHeadSchema } from "../shared/types";

export default {
  description:
    "Watches local git refs (refs/heads/main plus the current worktree's own branch) via @parcel/watcher. On every advance it notifies the refHeadResource live-state resource, runs the registered in-process ref reactions (every backend, nothing queued in between), and emits the durable git.refAdvanced trigger event (main only).",
  loadBearing: true,
  contributions: [Resource.Declare(refHeadResource)],
  register: [refAdvanced],
  onReady: async () => {
    await startGitWatcher();
  },
  onShutdown: async () => {
    await stopGitWatcher();
  },
} satisfies ServerPluginDefinition;
