import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2, watchConfig } from "@plugins/config_v2/server";
import { slowOpConfig } from "@plugins/debug/plugins/slow-ops/core";
import type { Thresholds } from "@plugins/debug/plugins/slow-ops/server";
import { flightRecorderConfig } from "../core";
import { testSlowOp } from "../shared/endpoints";
import { handleTestSlowOp } from "./internal/handle-test-slow-op";
import { installFlightHook } from "./internal/install-hook";
import type { FlightCfg } from "./internal/trip";

export default {
  description:
    "Slow-event flight recorder: on every span crossing its slow-op threshold, persists ONE coherent-window snapshot (trip + concurrently-open spans + recently-completed spans + gate occupancy + contention) to logs/flight-recorder.jsonl, rate-limited per op and globally.",
  contributions: [ConfigV2.Register({ descriptor: flightRecorderConfig })],
  httpRoutes: {
    [testSlowOp.route]: handleTestSlowOp,
  },
  // watchConfig fires the callback IMMEDIATELY on registration AND on every
  // change. The hook needs BOTH configs (slow-op thresholds define "what is
  // slow"; our config defines recorder behavior), so each watcher stashes its
  // latest value and reinstalls once both have arrived — subsequent calls
  // reinstall with the fresh pair. installFlightHook disposes the prior
  // subscription each time, so there is no double-install.
  onReady: () => {
    let latestThresholds: Thresholds | null = null;
    let latestCfg: FlightCfg | null = null;
    const reinstall = () => {
      if (latestThresholds && latestCfg) installFlightHook(latestThresholds, latestCfg);
    };
    watchConfig(slowOpConfig, (vals) => {
      latestThresholds = vals;
      reinstall();
    });
    watchConfig(flightRecorderConfig, (vals) => {
      latestCfg = vals;
      reinstall();
    });
  },
} satisfies ServerPluginDefinition;
