import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { voicingConfig } from "../core/config";

// Web runtime exists solely to register the voicing config descriptor — config_v2
// reads back undefined unless the descriptor is registered on BOTH web
// (WebRegister) and server (Register).
export default {
  description:
    "Web registration of the Sonata voicing config (realistic voice-leading, strategy, octave).",
  contributions: [ConfigV2.WebRegister({ descriptor: voicingConfig })],
} satisfies PluginDefinition;
