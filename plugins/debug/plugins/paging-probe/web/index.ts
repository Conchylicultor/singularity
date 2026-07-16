import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { pagingProbeConfig } from "../core";

// Web presence: registers the paging-probe config for Settings -> Config. No
// pane — the probe output is plain JSONL (paging-probe-<variant>.jsonl), read by
// timestamp-window join against health.jsonl / health-host.jsonl /
// duress-episodes; there is no bespoke UI.
export default {
  description:
    "Paging-probe web presence: registers the twin-probe config (enable, fat heap size, touch slice, GC cadence, QoS boost) for Settings -> Config.",
  contributions: [ConfigV2.WebRegister({ descriptor: pagingProbeConfig })],
} satisfies PluginDefinition;
