import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
// Lean, eval-safe leaf: the whole import graph below this barrel is drizzle +
// database/admin/server + paths/core — NEVER config_v2 / notifications /
// env-bound db / jobs / events. That is what lets the env-less `./singularity
// build` CLI import the recorder without evaluating the heavy build/server graph.
export { _buildRuns } from "./internal/tables";
export { createBuildRunRecorder } from "./internal/recorder";
export type { BuildRunRecorder } from "./internal/recorder";
export default {
  description:
    "Lean build-runs ledger leaf: the build_runs table def + the CLI build-run recorder, importable by the `./singularity build` CLI without the heavy build barrel (which pulls config_v2/notifications).",
  contributions: [],
} satisfies ServerPluginDefinition;
