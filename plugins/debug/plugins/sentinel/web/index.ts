import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { Reports } from "@plugins/reports/web";
import { sentinelConfig } from "../core";
import { DuressEpisodeSummary } from "./components/duress-episode-summary";

// Web presence: registers the sentinel config for Settings → Config and the
// duress-episode report summary for Debug → Reports. The "cluster" trace section
// renders through the pane's GenericEventLane fallback for now; a dedicated
// Trace.Lane (load/pg/builds sparklines) is a follow-up.
export default {
  description:
    "Sentinel web presence: registers the sentinel config (sampler cadence + onset thresholds) for Settings → Config, plus the one-line duress-episode report summary for Debug → Reports.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: sentinelConfig }),
    Reports.KindView({ match: "duress-episode", component: DuressEpisodeSummary }),
  ],
} satisfies PluginDefinition;
