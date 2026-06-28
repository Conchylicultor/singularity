import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleBootBenchRun } from "./internal/handle-run";
import { benchmarkBootTool } from "./internal/mcp-tools";
import { bootBenchRun } from "../shared/endpoints";

export default {
  description:
    "Cold-boot & live-state loader benchmark harness: a POST endpoint that runs the boot burst in-process and a benchmark_boot MCP tool that aggregates it.",
  httpRoutes: {
    [bootBenchRun.route]: handleBootBenchRun,
  },
  register: [benchmarkBootTool],
} satisfies ServerPluginDefinition;
