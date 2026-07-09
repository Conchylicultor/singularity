import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { Reports } from "@plugins/reports/web";
import { sessionDivergenceConfig } from "../core";
import { SessionDivergenceSummary } from "./components/session-divergence-summary";

export default {
  collapsed: true,
  description:
    "Session-divergence report renderer: a one-line Debug → Reports summary for the conversation-session-divergence kind, plus the enabled/grace config registration.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: sessionDivergenceConfig }),
    Reports.KindView({
      match: "conversation-session-divergence",
      component: SessionDivergenceSummary,
    }),
  ],
} satisfies PluginDefinition;
