import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { refAdvanced } from "@plugins/infra/plugins/git-watcher/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { ConfigV2, getConfig } from "@plugins/config_v2/server";
import { handleBuild } from "./internal/handle-build";
import { reconcileOrphanBuilds } from "./internal/run-build";
import { buildRunJob } from "./internal/build-run-job";
import { buildRunDebouncedJob } from "./internal/build-run-debounced-job";
import { getMainAhead } from "./internal/git-status";
import { mainAheadCountResource } from "./internal/main-ahead-resource";
import { buildHistoryResource } from "./internal/build-history-resource";
import { frontendHashResource } from "./internal/frontend-hash-resource";
export { _buildRuns } from "./internal/tables";
import { buildConfig } from "../shared";
import { triggerBuildEndpoint } from "../core/endpoints";

export default {
  contributions: [ConfigV2.Register({ descriptor: buildConfig }), Resource.Declare(mainAheadCountResource, { bootCritical: true }), Resource.Declare(buildHistoryResource, { bootCritical: true }), Resource.Declare(frontendHashResource, { bootCritical: true }), Trigger({ on: refAdvanced.where({ refName: "refs/heads/main" }), do: buildRunJob, with: {}, oneShot: false })],
  httpRoutes: {
    [triggerBuildEndpoint.route]: handleBuild,
  },
  register: [buildRunJob, buildRunDebouncedJob],
  onReady: async () => {
    // Close any build left unfinished by a crashed owner (scoped to this
    // namespace so inherited main rows aren't reaped into a phantom "Build
    // failed"). Also clears the build_runs_inflight_uniq lock for the next build.
    await reconcileOrphanBuilds();

    if (!isMain()) return;

    const { autoBuild } = getConfig(buildConfig);
    if (autoBuild) {
      const { count } = await getMainAhead();
      if (count > 0) {
        // On boot we already know main is ahead — build immediately (no runAt).
        // There is no push burst to coalesce here, and routing through
        // buildRunJob would only add a pointless DEBOUNCE_MS delay.
        await buildRunDebouncedJob.enqueue({});
      }
    }
  },
} satisfies ServerPluginDefinition;
