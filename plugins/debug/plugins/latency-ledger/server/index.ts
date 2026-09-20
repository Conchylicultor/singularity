import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { getLatencySummary, submitClientLatency } from "../core";
import { handleClientLatency } from "./internal/ingest";
import { handleLatencySummary } from "./internal/query";
import { startLatencyRecorder, stopLatencyRecorder } from "./internal/recorder";
import {
  hostMinuteRetention,
  interactionRetention,
  minuteRetention,
  threadMinuteRetention,
} from "./internal/retention";
import { ledgerContributions } from "./internal/contributions";

export default {
  description:
    "The server half of the latency ledger: counts every delivery to a tab, every 10 s thread-lag sample and every stack sample by owning plugin into per-minute histograms, merges the browser's page-load / navigation / update-delay minutes into the same rows, and answers p50 / p95 for any window split into calm and under-pressure minutes, with the track's exit criteria as pass / fail.",
  contributions: ledgerContributions,
  httpRoutes: {
    [submitClientLatency.route]: handleClientLatency,
    [getLatencySummary.route]: handleLatencySummary,
  },
  register: [
    minuteRetention,
    hostMinuteRetention,
    threadMinuteRetention,
    interactionRetention,
  ],
  onReady: startLatencyRecorder,
  onShutdown: stopLatencyRecorder,
} satisfies ServerPluginDefinition;
