import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
// Force the fields filter-sql capability barrels to evaluate (self-registering
// their operator maps into the `server-capabilities` eager index) so
// `resolveFieldFilterSql` in handle-history-query resolves, and so the composition
// closure includes those barrels in any release bundle shipping this handler.
import "@plugins/fields/plugins/server-capabilities-loader/server";
import {
  triggerReleaseEndpoint,
  releaseCandidateEndpoint,
  releaseLatestRunEndpoint,
  previewEndpoint,
  stopPreviewEndpoint,
  releaseLogsEndpoint,
  queryReleaseHistory,
} from "../core/endpoints";
import { handleRelease } from "./internal/handle-release";
import { handleReleaseCandidate } from "./internal/handle-candidate";
import { handleLatestRun } from "./internal/handle-latest-run";
import { handlePreview, handleStopPreview } from "./internal/handle-preview";
import { handleReleaseLogs } from "./internal/handle-logs";
import { handleHistoryQuery } from "./internal/handle-history-query";
import { reconcileOrphanReleases } from "./internal/run-release";
import { reconcileOrphanPreviews } from "./internal/preview-manager";
import { releaseRunResource } from "./internal/release-run-resource";
import { releaseRunsRevisionResource } from "./internal/history-revision-resource";
import { previewStateResource } from "./internal/preview-state-resource";
export { _releaseRuns } from "./internal/tables";
export { triggerRelease, runRelease } from "./internal/run-release";
export type { ReleaseOutcome, TriggerReleaseOptions } from "./internal/run-release";
// `releaseOutDir` / `newReleaseRunId` are NOT re-exported here: they now live in
// `@plugins/release/plugins/bundles/server`, which is DB-free and therefore
// importable by a CLI process — import them from there.
export { Release, collectReleaseEnv } from "./internal/env-provider";

export default {
  description: "Local composition release lifecycle engine: run, observe, preview F4 artifacts.",
  contributions: [
    Resource.Declare(releaseRunResource),
    Resource.Declare(releaseRunsRevisionResource),
    Resource.Declare(previewStateResource),
  ],
  httpRoutes: {
    [triggerReleaseEndpoint.route]: handleRelease,
    [releaseCandidateEndpoint.route]: handleReleaseCandidate,
    [releaseLatestRunEndpoint.route]: handleLatestRun,
    [previewEndpoint.route]: handlePreview,
    [stopPreviewEndpoint.route]: handleStopPreview,
    [releaseLogsEndpoint.route]: handleReleaseLogs,
    [queryReleaseHistory.route]: handleHistoryQuery,
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
