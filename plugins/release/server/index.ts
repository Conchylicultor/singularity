import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { triggerReleaseEndpoint, previewEndpoint, stopPreviewEndpoint, releaseLogsEndpoint } from "../core/endpoints";
import { handleRelease } from "./internal/handle-release";
import { handlePreview, handleStopPreview } from "./internal/handle-preview";
import { handleReleaseLogs } from "./internal/handle-logs";
import { reconcileOrphanReleases } from "./internal/run-release";
import { reconcileOrphanPreviews } from "./internal/preview-manager";
import { releaseHistoryResource } from "./internal/release-history-resource";
import { previewStateResource } from "./internal/preview-state-resource";
export { _releaseRuns } from "./internal/tables";
export { triggerRelease } from "./internal/run-release";

export default {
  description: "Local composition release lifecycle engine: run, observe, preview F4 artifacts.",
  contributions: [
    Resource.Declare(releaseHistoryResource, { bootCritical: true }),
    Resource.Declare(previewStateResource, { bootCritical: true }),
  ],
  httpRoutes: {
    [triggerReleaseEndpoint.route]: handleRelease,
    [previewEndpoint.route]: handlePreview,
    [stopPreviewEndpoint.route]: handleStopPreview,
    [releaseLogsEndpoint.route]: handleReleaseLogs,
  },
  onReady: async () => {
    // Close any release left unfinished by a crashed owner (scoped to this
    // namespace so inherited main rows aren't reaped into phantom state) and
    // clear the release_runs_inflight_uniq lock for the next release.
    await reconcileOrphanReleases();
    // Drop any preview whose gateway died across the restart, and reap orphan
    // /tmp/sgp-* stacks left running by a prior backend lifetime.
    await reconcileOrphanPreviews();
  },
} satisfies ServerPluginDefinition;
