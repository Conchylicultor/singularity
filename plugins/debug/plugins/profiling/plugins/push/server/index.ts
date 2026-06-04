import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { isWorktreeOpActive } from "@plugins/infra/plugins/worktree/server";
import { handlePushProfiling } from "./internal/handle-push-profiling";
import { finalizeOrphanedBuilds } from "./internal/read-build-log";
import { finalizeOrphanedPushes } from "./internal/read-contention";
import { getPushProfiling } from "../shared/endpoints";

export default {
  name: "Push Profiling",
  description: "Push contention profiling data endpoint.",
  httpRoutes: {
    [getPushProfiling.route]: handlePushProfiling,
  },
  // Reconcile orphaned build-log and push-contention records (builds/pushes
  // hard-killed before their CLI could write a terminal record). Both are single
  // global files, so only the main backend reconciles them — gating avoids
  // concurrent writes from every worktree backend. Work still running is skipped
  // via the op marker.
  onReady: () => {
    if (!isMain()) return;
    finalizeOrphanedBuilds(isWorktreeOpActive);
    finalizeOrphanedPushes(isWorktreeOpActive);
  },
} satisfies ServerPluginDefinition;
