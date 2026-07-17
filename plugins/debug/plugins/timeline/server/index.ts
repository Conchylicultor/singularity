import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleTimeline } from "./internal/handle-timeline";
import { timelineTool } from "./internal/mcp-tool";
import { getTimeline } from "../shared/frames";

export default {
  description:
    "Cross-worktree unified timeline endpoint: fans out over every live worktree DB fork (traces, slow-op samples, reports, builds) plus the per-worktree disk logs (boot events, health series), normalizes everything to wall-clock TimelineEvents, and streams them as NDJSON — pull-only, never live or polled.",
  httpRoutes: {
    [getTimeline.route]: handleTimeline,
  },
  register: [timelineTool],
} satisfies ServerPluginDefinition;
