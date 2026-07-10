import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { duressConfig } from "../core";

// Web presence: registers the duress shed-engine config for Settings → Config.
export default {
  description:
    "Duress web presence: registers the shed-engine config (enabled, persist-first-N, buffer caps, flush delay) for Settings → Config.",
  contributions: [ConfigV2.WebRegister({ descriptor: duressConfig })],
} satisfies PluginDefinition;
