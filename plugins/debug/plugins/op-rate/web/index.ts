import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { Reports } from "@plugins/reports/web";
import { opRateConfig } from "../core";
import { OpRateSummary } from "./components/op-rate-summary";

export default {
  collapsed: true,
  description:
    "Op-rate report renderer: a one-line Debug → Reports summary for the op-rate kind, plus the per-kind threshold config registration.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: opRateConfig }),
    Reports.KindView({ match: "op-rate", component: OpRateSummary }),
  ],
} satisfies PluginDefinition;
