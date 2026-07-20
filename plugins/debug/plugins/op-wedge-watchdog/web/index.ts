import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { Reports } from "@plugins/reports/web";
import { opWedgeWatchdogConfig } from "../core";
import { OpWedgeSummary } from "./components/op-wedge-summary";

export default {
  collapsed: true,
  description:
    "CLI op-wedge report renderer: a one-line Debug → Reports summary for the cli-op-wedge kind (CPU verdict, live-child count, partial-capture marker), plus the op-wedge-watchdog budget/capture config registration.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: opWedgeWatchdogConfig }),
    Reports.KindView({ match: "cli-op-wedge", component: OpWedgeSummary }),
  ],
} satisfies PluginDefinition;
