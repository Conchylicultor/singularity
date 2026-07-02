import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { flightRecorderConfig } from "../core";

export default {
  collapsed: true,
  description:
    "Surfaces the flight-recorder knobs (enabled, cooldown, global cap, lookback window) in Settings → Config; snapshots themselves are read from logs/flight-recorder.jsonl.",
  contributions: [ConfigV2.WebRegister({ descriptor: flightRecorderConfig })],
} satisfies PluginDefinition;
