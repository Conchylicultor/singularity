import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { handleHealthData } from "./internal/handle-health-data";
import { startProcessSampler, stopProcessSampler } from "./internal/process-sampler";
import { startHostSampler, stopHostSampler } from "./internal/host-sampler";
import { getHealthData } from "../shared/endpoints";

// The health JSONL line shapes, for server-side consumers that scan the same
// per-worktree files this plugin writes (debug/timeline's health heat lanes).
export { HealthSampleSchema, HostSampleSchema } from "../shared/schema";
export type { HealthSample, HostSample } from "../shared/schema";

export default {
  description:
    "Continuous per-backend health sampler: event-loop lag, GC/heap pressure, and phys_footprint appended to per-worktree JSONL (read from disk even when a backend is wedged), plus main-only host metrics. Surfaced as the Debug → Health pane.",
  httpRoutes: {
    [getHealthData.route]: handleHealthData,
  },
  onReady: () => {
    startProcessSampler();
    if (isMain()) startHostSampler();
  },
  onShutdown: () => {
    stopProcessSampler();
    if (isMain()) stopHostSampler();
  },
} satisfies ServerPluginDefinition;
