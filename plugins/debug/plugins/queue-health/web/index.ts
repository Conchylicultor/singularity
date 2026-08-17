import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { Reports } from "@plugins/reports/web";
import { queueHealthConfig } from "../core";
import { DeadJobSummary } from "./components/dead-job-summary";
import { BacklogSummary } from "./components/backlog-summary";
import { SlotHogSummary } from "./components/slot-hog-summary";
import { WedgedSummary } from "./components/wedged-summary";

export default {
  collapsed: true,
  description:
    "Queue-health report renderers: one-line Debug → Reports summaries for the queue-wedged, queue-dead-job, queue-backlog, and queue-slot-hog kinds, plus the threshold config registration.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: queueHealthConfig }),
    Reports.KindView({ match: "queue-dead-job", component: DeadJobSummary }),
    Reports.KindView({ match: "queue-backlog", component: BacklogSummary }),
    Reports.KindView({ match: "queue-slot-hog", component: SlotHogSummary }),
    Reports.KindView({ match: "queue-wedged", component: WedgedSummary }),
  ],
} satisfies PluginDefinition;
