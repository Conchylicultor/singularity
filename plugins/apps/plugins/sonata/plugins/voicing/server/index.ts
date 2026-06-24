import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { voicingConfig } from "../core/config";

// Server runtime exists solely to register the voicing config descriptor —
// config_v2 reads back undefined unless the descriptor is registered on BOTH
// web (WebRegister) and server (Register).
export default {
  description:
    "Server registration of the Sonata voicing config (realistic voice-leading, strategy, octave).",
  contributions: [ConfigV2.Register({ descriptor: voicingConfig })],
} satisfies ServerPluginDefinition;
