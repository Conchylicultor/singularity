import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { isMain, isRelease } from "@plugins/infra/plugins/paths/server";
import { sentinelConfig } from "../core";
import { clusterClass } from "./internal/cluster-class";
import { fleetFlightsClass } from "./internal/fleet-flights";
import { startSentinelSampler, stopSentinelSampler } from "./internal/sampler";

export { readDuressEpisodes } from "./internal/read-duress-episodes";

export default {
  description:
    "Cluster congestion sentinel: a main-only always-on sampler + onset detector + duress-latch lifecycle on a dedicated worker thread (host load, Postgres-side wait/lock/IO pressure, fleet state, per-backend health rollup, compressor pressure), feeding the 'cluster' trace ring so every trace gains a cluster-vitals lane, congestion onset is observable, and the latch lease survives a wedged main loop. Persists duress episodes as trip/clear lines on the duress-episodes channel (readDuressEpisodes).",
  contributions: [
    clusterClass.contribution,
    fleetFlightsClass.contribution,
    ConfigV2.Register({ descriptor: sentinelConfig }),
  ],
  // Runs on the host singleton: main in dev (the one backend of the worktree
  // fleet that owns the cluster-wide sampler + latch), OR the single backend of
  // a compiled release (where SINGULARITY_WORKTREE is the composition name, so
  // isMain() is false yet that lone backend IS the host singleton).
  onReady: () => {
    if (!isMain() && !isRelease()) return;
    startSentinelSampler();
  },
  onShutdown: async () => {
    if (!isMain() && !isRelease()) return;
    await stopSentinelSampler();
  },
} satisfies ServerPluginDefinition;
