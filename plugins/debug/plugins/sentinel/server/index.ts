import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { sentinelConfig } from "../core";
import { clusterClass } from "./internal/cluster-class";
import { fleetFlightsClass } from "./internal/fleet-flights";
import { startOnsetDetector, stopOnsetDetector } from "./internal/onset";
import { startSentinelSampler, stopSentinelSampler } from "./internal/sampler";

export default {
  description:
    "Cluster congestion sentinel: a main-only always-on sampler feeding the 'cluster' trace ring (host load, Postgres-side wait/lock/IO pressure, fleet state, per-backend health rollup) so every trace gains a cluster-vitals lane and congestion onset is observable.",
  contributions: [
    clusterClass.contribution,
    fleetFlightsClass.contribution,
    ConfigV2.Register({ descriptor: sentinelConfig }),
  ],
  onReady: () => {
    if (!isMain()) return;
    // Detector first: it must be subscribed before the first tick fires.
    startOnsetDetector();
    startSentinelSampler();
  },
  onShutdown: () => {
    if (!isMain()) return;
    stopSentinelSampler();
    stopOnsetDetector();
  },
} satisfies ServerPluginDefinition;
