import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { queueHealthConfig } from "../core";
import { queueHealthMonitorJob } from "./internal/monitor-job";
import { deadJobKind } from "./internal/dead-job-kind";
import { backlogKind } from "./internal/backlog-kind";

export default {
  description:
    "Queue-health monitor: a cheap per-worktree scheduled job that samples the graphile queue and files deduped reports for terminally-dead jobs (per jobName) and backlog/stall, through the existing reports engine.",
  register: [queueHealthMonitorJob],
  contributions: [
    ConfigV2.Register({ descriptor: queueHealthConfig }),
    deadJobKind,
    backlogKind,
  ],
} satisfies ServerPluginDefinition;
