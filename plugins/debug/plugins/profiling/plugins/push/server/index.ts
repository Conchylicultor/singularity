import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { isWorktreeOpActive } from "@plugins/infra/plugins/worktree/server";
import { handlePushProfiling } from "./internal/handle-push-profiling";
import { finalizeOrphanedBuilds } from "./internal/read-build-log";
import { getPushProfiling } from "../shared/endpoints";

export default {
  name: "Push Profiling",
  description: "Push contention profiling data endpoint.",
  httpRoutes: {
    [getPushProfiling.route]: handlePushProfiling,
  },
  // Reconcile orphaned build-log records (builds hard-killed before their CLI
  // could write a terminal record). The build-log is a single global file, so
  // only the main backend reconciles it — gating avoids concurrent writes from
  // every worktree backend. Builds still running are skipped via the op marker.
  onReady: () => {
    if (!isMain()) return;
    finalizeOrphanedBuilds(isWorktreeOpActive);
  },
} satisfies ServerPluginDefinition;
