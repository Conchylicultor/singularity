import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { sentinelConfig } from "../core";

// Web presence: registers the sentinel config for Settings → Config. The
// "cluster" trace section renders through the pane's GenericEventLane fallback
// for now; a dedicated Trace.Lane (load/pg/builds sparklines) is a follow-up.
export default {
  description:
    "Sentinel web presence: registers the sentinel config (sampler cadence + onset thresholds) for Settings → Config.",
  contributions: [ConfigV2.WebRegister({ descriptor: sentinelConfig })],
} satisfies PluginDefinition;
