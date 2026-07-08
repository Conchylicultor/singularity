import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { Reports } from "@plugins/reports/web";
import { readSetShrinkConfig } from "../core";
import { ShrinkSummary } from "./components/shrink-summary";

export default {
  collapsed: true,
  description:
    "Read-set shrink report renderer: a one-line Debug → Reports summary for the read-set-shrink kind, plus the enabled config registration.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: readSetShrinkConfig }),
    Reports.KindView({ match: "read-set-shrink", component: ShrinkSummary }),
  ],
} satisfies PluginDefinition;
