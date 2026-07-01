import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { queueHealthConfig, queueHealthSummaryEndpoint } from "../core";
import { queueHealthMonitorJob } from "./internal/monitor-job";
import { deadJobKind } from "./internal/dead-job-kind";
import { backlogKind } from "./internal/backlog-kind";
import { slotHogKind } from "./internal/slot-hog-kind";
import { queueHealthTool } from "./internal/mcp-tool";
import { handleQueueHealthSummary } from "./internal/summary-endpoint";

export default {
  description:
    "Queue-health monitor: a cheap per-worktree scheduled job that samples the graphile queue and files deduped reports for terminally-dead jobs (per jobName), backlog/stall (with per-jobName attribution), and slot-hogging jobs, through the existing reports engine. Also exposes a queue-health summary endpoint + the get_queue_health MCP tool.",
  httpRoutes: {
    [queueHealthSummaryEndpoint.route]: handleQueueHealthSummary,
  },
  register: [queueHealthMonitorJob, queueHealthTool],
  contributions: [
    ConfigV2.Register({ descriptor: queueHealthConfig }),
    deadJobKind,
    backlogKind,
    slotHogKind,
  ],
} satisfies ServerPluginDefinition;
