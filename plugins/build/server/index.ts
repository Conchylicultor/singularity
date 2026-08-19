import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { refAdvanced } from "@plugins/infra/plugins/git-watcher/server";
import { ConfigV2 } from "@plugins/config_v2/server";
import { handleBuild } from "./internal/handle-build";
import { handleServeComposition } from "./internal/handle-serve-composition";
import { reconcileOrphanBuilds } from "./internal/run-build";
import { watchInflightBuild } from "./internal/watch-inflight-build";
import { buildRunJob } from "./internal/build-run-job";
import { buildRunDebouncedJob } from "./internal/build-run-debounced-job";
import { reconcileDeployment } from "./internal/reconcile";
import { buildHistoryResource } from "./internal/build-history-resource";
import { buildConfig } from "../shared";
import {
  triggerBuildEndpoint,
  serveCompositionEndpoint,
} from "../core/endpoints";

export default {
  contributions: [
    ConfigV2.Register({ descriptor: buildConfig }),
    Resource.Declare(buildHistoryResource),
    Trigger({
      on: refAdvanced.where({ refName: "refs/heads/main" }),
      do: buildRunJob,
      with: {},
      oneShot: false,
    }),
  ],
  httpRoutes: {
    [triggerBuildEndpoint.route]: handleBuild,
    [serveCompositionEndpoint.route]: handleServeComposition,
  },
  register: [buildRunJob, buildRunDebouncedJob],
  onReady: async () => {
    // Close any build left unfinished by a crashed owner (scoped to this
    // namespace so inherited main rows aren't reaped into a phantom "Build
    // failed"). Also clears the build_runs_inflight_uniq lock for the next build.
    await reconcileOrphanBuilds();

    // If a live in-flight build just restarted this backend, adopt it: arm a
    // short-lived watch that closes its row the instant the CLI writes its
    // terminal artifact, instead of leaving it open until the next reconcile.
    // Per-namespace, like the reconcile above — not isMain-gated.
    await watchInflightBuild();

    // The "observer starts" edge. It exists because the other two edges both run
    // in a process a build can kill: if a push lands while a build is finishing,
    // the reconcile that would have caught it can die with the backend. This one
    // asks the same question from durable state after the restart, so the answer
    // survives. In the 2026-08-19 incident this edge alone would have caught it.
    //
    // Both the main-only scope and the autoBuild kill switch live inside
    // reconcileDeployment, so every edge is gated identically by construction.
    await reconcileDeployment();
  },
} satisfies ServerPluginDefinition;
