import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { chordLabelConfig } from "../shared/config";

// Server runtime exists solely to register the chord-label config descriptor —
// config_v2 reads back undefined unless the descriptor is registered on BOTH
// web (WebRegister) and server (Register).
export default {
  description:
    "Server registration of the Sonata chord-label config (the shared symbol/numeral/both display mode).",
  contributions: [ConfigV2.Register({ descriptor: chordLabelConfig })],
} satisfies ServerPluginDefinition;
