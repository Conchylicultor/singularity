import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { queueHealthConfig, queueHealthSummaryEndpoint } from "../core";
import {
  startQueueHealthWatchdog,
  stopQueueHealthWatchdog,
} from "./internal/watchdog";
import { deadJobKind } from "./internal/dead-job-kind";
import { backlogKind } from "./internal/backlog-kind";
import { slotHogKind } from "./internal/slot-hog-kind";
import { wedgedKind } from "./internal/wedged-kind";
import { queueHealthTool } from "./internal/mcp-tool";
import { handleQueueHealthSummary } from "./internal/summary-endpoint";

export { queueHealthTickOnce } from "./internal/watchdog";

export default {
  description:
    "Queue-health watchdog: a 30s interval on the backend's own event loop — deliberately NOT a scheduled job, which would queue behind the wedge it exists to detect — that samples the graphile queue and files deduped reports for a wedged queue (every slot held by the same live jobs while ready work starves), backlog/stall, slot-hogging jobs, and terminally-dead jobs, through the existing reports engine. All four kinds are duressExempt. Also exposes a queue-health summary endpoint + the get_queue_health MCP tool.",
  httpRoutes: {
    [queueHealthSummaryEndpoint.route]: handleQueueHealthSummary,
  },
  register: [queueHealthTool],
  contributions: [
    ConfigV2.Register({ descriptor: queueHealthConfig }),
    deadJobKind,
    backlogKind,
    slotHogKind,
    wedgedKind,
  ],
  // The watchdog is a raw interval on this backend's event loop, started and
  // stopped exactly like the jobs plugin's stuck-lock sweeper — see the long
  // comment in `internal/watchdog.ts` for why it must not be a `defineJob`.
  onReady: () => {
    startQueueHealthWatchdog();
  },
  onShutdown: () => {
    stopQueueHealthWatchdog();
  },
} satisfies ServerPluginDefinition;
